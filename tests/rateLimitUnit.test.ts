/** lib/rateLimit.ts without a database: the Supabase client is mocked. The
 * real counter (rate_limit_hit) is exercised by tests/rateLimit.test.ts. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

const { checkRateLimit, clientIp, rateLimitKey, retryAfterSeconds, ruleFromEnv } = await import("../lib/rateLimit");

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/availability", { headers });
}

describe("rate limit helpers", () => {
  it("takes the first x-forwarded-for address, else 'unknown'", () => {
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(request())).toBe("unknown");
  });

  it("never puts the raw IP into the key", () => {
    const key = rateLimitKey("reservations.create", "203.0.113.7");
    expect(key.startsWith("reservations.create:")).toBe(true);
    expect(key).not.toContain("203.0.113.7");
    expect(rateLimitKey("reservations.create", "203.0.113.7")).toBe(key);
    expect(rateLimitKey("reservations.create", "203.0.113.8")).not.toBe(key);
  });

  it("parses <limit>/<seconds> overrides and ignores malformed ones", () => {
    const fallback = { limit: 10, windowSeconds: 60 };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(ruleFromEnv("20/30", fallback)).toEqual({ limit: 20, windowSeconds: 30 });
    expect(ruleFromEnv(undefined, fallback)).toBe(fallback);
    expect(ruleFromEnv("lots", fallback)).toBe(fallback);
    expect(ruleFromEnv("0/60", fallback)).toBe(fallback);
    expect(ruleFromEnv("5/100000", fallback)).toBe(fallback);
  });

  it("counts Retry-After to the end of the epoch-aligned window", () => {
    expect(retryAfterSeconds(60, 120_000)).toBe(60);
    expect(retryAfterSeconds(60, 125_000)).toBe(55);
    expect(retryAfterSeconds(3600, 3_599_000)).toBe(1);
  });
});

describe("checkRateLimit", () => {
  const rule = { limit: 2, windowSeconds: 60 };
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    rpc.mockReset();
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = previous;
    vi.restoreAllMocks();
  });

  it("lets the request through while under the limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await checkRateLimit(request(), "test", rule)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", expect.objectContaining({ p_window_seconds: 60, p_limit: 2 }));
  });

  it("answers 429 with Retry-After once the limit is exceeded", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const res = await checkRateLimit(request(), "test", rule);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res?.json()).toEqual({ error: "слишком много запросов, попробуйте позже" });
  });

  it("fails open when the database errors or is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect(await checkRateLimit(request(), "test", rule)).toBeNull();
    rpc.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await checkRateLimit(request(), "test", rule)).toBeNull();
  });

  it("is a no-op when RATE_LIMIT_DISABLED=1", async () => {
    process.env.RATE_LIMIT_DISABLED = "1";
    expect(await checkRateLimit(request(), "test", rule)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

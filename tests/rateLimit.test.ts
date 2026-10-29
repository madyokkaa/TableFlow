/** The real per-IP counter (rate_limit_hit) against a Supabase TEST
 * project - needs the 20261029120000_rate_limits migration applied there.
 * The limiter is off for every other test file (vitest.setup.ts); this one
 * switches it on explicitly. */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkRateLimit, rateLimitKey } from "../lib/rateLimit";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("checkRateLimit against the database", () => {
  const name = `test.rate-limit.${Date.now()}`;
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  let previous: string | undefined;

  beforeAll(() => {
    previous = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
  });
  afterAll(async () => {
    if (previous !== undefined) process.env.RATE_LIMIT_DISABLED = previous;
    await admin.from("rate_limits").delete().eq("key", rateLimitKey(name, ip));
  });

  function request() {
    return new NextRequest("http://localhost/api/availability", { headers: { "x-forwarded-for": ip } });
  }

  it("allows `limit` requests in a window, then answers 429", async () => {
    const rule = { limit: 2, windowSeconds: 600 };
    expect(await checkRateLimit(request(), name, rule)).toBeNull();
    expect(await checkRateLimit(request(), name, rule)).toBeNull();
    const limited = await checkRateLimit(request(), name, rule);
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("is not callable with the anon key", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.rpc("rate_limit_hit", { p_key: "x", p_window_seconds: 60, p_limit: 1 });
    expect(error).not.toBeNull();
  });
});

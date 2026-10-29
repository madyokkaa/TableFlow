/** POST /api/telegram without a network: the secret check, update_id
 * de-duplication and handing the update off after the response. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const handleUpdate = vi.fn(async () => {});
const afterCallbacks: (() => unknown)[] = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => void afterCallbacks.push(cb),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/telegram/bot", () => ({ handleUpdate }));
vi.mock("@/lib/telegram/deps", () => ({ productionBotDeps: () => ({}) }));

const { POST } = await import("../app/api/telegram/route");

const SECRET = "s".repeat(40);
const post = (body: unknown, secret: string | null = SECRET) =>
  POST(
    new NextRequest("http://localhost/api/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockReset();
  handleUpdate.mockClear();
  afterCallbacks.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/telegram", () => {
  const update = { update_id: 100, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "hi" } };

  it("rejects a missing or wrong secret (401) without touching anything", async () => {
    expect((await post(update, null)).status).toBe(401);
    expect((await post(update, "x".repeat(40))).status).toBe(401);
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await post(update, "")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("handles a re-delivered update_id only once", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect((await post(update)).status).toBe(200);
    expect((await post(update)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("telegram_claim_update", { p_update_id: 100 });
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledWith(update, {});
  });

  it("asks Telegram to retry (500) when the update can't be claimed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    expect((await post(update)).status).toBe(500);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("rejects a body without update_id (400)", async () => {
    expect((await post({ hello: 1 })).status).toBe(400);
  });
});

describe("GET /api/telegram", () => {
  it("reports which settings are set without revealing them", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:secret-token");
    const { GET } = await import("../app/api/telegram/route");
    const body = await (await GET()).json();
    expect(body).toMatchObject({ webhook_secret_set: true, webhook_secret_length: 40, bot_token_set: true });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });
});

/** Guest notifications on staff edits, without a network: Supabase and the
 * Telegram API are faked. */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn();
vi.mock("@/lib/telegram", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/telegram")>()), sendMessage }));
vi.mock("@/lib/supabase/auth", () => ({ requireStaff: async () => ({ id: "staff-1", email: null }) }));

type Row = Record<string, unknown>;
let current: Row;
let updated: Row;
const updates: { table: string; values: Row }[] = [];

function query(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "insert"]) q[m] = () => q;
  q.update = (values: Row) => {
    updates.push({ table, values });
    return q;
  };
  q.maybeSingle = async () => ({ data: table === "reservations" ? current : table === "telegram_sessions" ? { lang: "kk" } : null, error: null });
  q.single = async () => ({ data: updated, error: null });
  q.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, rpc: async () => ({ data: null, error: null }) }),
}));

const { PATCH } = await import("../app/api/reservations/[id]/route");
const { notificationFor } = await import("../lib/telegram/notify");

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/reservations/7", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "7" }),
  });

const base = {
  id: 7,
  date: "2026-11-20",
  start_time: "19:00:00",
  duration_minutes: 90,
  party_size: 4,
  guest_name: "Айгерім",
  guest_phone: "+7 (701) 123-45-67",
  guest_email: null,
  cancellation_reason: null,
  reservation_tables: [{ table_id: 3, dining_tables: { id: 3, label: "3", hall_id: 1, halls: { id: 1, name: "Негізгі зал" } } }],
};

beforeEach(() => {
  sendMessage.mockReset().mockResolvedValue(11);
  updates.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guest notifications on staff edits", () => {
  it("confirming a Telegram booking messages the guest once and records it", async () => {
    current = { ...base, status: "pending", telegram_chat_id: 555 };
    updated = { ...base, status: "confirmed", telegram_chat_id: 555 };
    const res = await patch({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(555);
    expect(sendMessage.mock.calls[0][1]).toBe("Брондау расталды ✅\n20 қараша, жұма, 19:00, Негізгі зал. Күтеміз!");
    expect(updates.some((u) => u.table === "reservations" && "confirmation_notified_at" in u.values)).toBe(true);
  });

  it("does not message anyone for a website booking", async () => {
    current = { ...base, status: "pending", telegram_chat_id: null };
    updated = { ...base, status: "confirmed", telegram_chat_id: null };
    expect((await patch({ status: "confirmed" })).status).toBe(200);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("a Telegram failure doesn't change the PATCH response", async () => {
    current = { ...base, status: "pending", telegram_chat_id: 555 };
    updated = { ...base, status: "confirmed", telegram_chat_id: 555 };
    sendMessage.mockRejectedValueOnce(new Error("network down"));
    const res = await patch({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("confirmed");
  });

  it("picks the right message for cancel and reschedule", () => {
    const after = { id: 7, telegram_chat_id: 555, cancellation_reason: null, hallName: null, date: "2026-11-20", start_time: "19:00:00" };
    const before = { status: "confirmed", date: "2026-11-20", start_time: "19:00:00" };
    expect(notificationFor(before, { ...after, status: "cancelled" })).toBe("cancelled");
    expect(notificationFor(before, { ...after, status: "confirmed", start_time: "20:00:00" })).toBe("rescheduled");
    expect(notificationFor(before, { ...after, status: "completed" })).toBeNull();
    expect(notificationFor(before, { ...after, status: "confirmed" })).toBeNull();
  });
});

/** The one-hour reminder, without a network or database. */
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dueForReminder, minutesUntil, sendDueReminders, type ReminderCandidate } from "../lib/telegram/reminders";
import { restaurantClock } from "../lib/ai/clock";

// 14:50 UTC on the 30th is 23:50 on the 30th in Tokyo (UTC+9).
const LATE = restaurantClock(new Date("2026-10-30T14:50:00Z"), "Asia/Tokyo");

describe("reminder window", () => {
  it("counts minutes across midnight in the restaurant's zone", () => {
    expect(LATE.todayIso).toBe("2026-10-30");
    expect(minutesUntil("2026-10-31", "00:50:00", LATE)).toBe(60);
    expect(minutesUntil("2026-10-30", "23:59:00", LATE)).toBe(9);
    expect(Number.isNaN(minutesUntil("2026-11-02", "12:00:00", LATE))).toBe(true);
  });

  it("keeps only bookings 45-75 minutes ahead", () => {
    const row = (id: number, date: string, start_time: string): ReminderCandidate => ({ id, date, start_time, telegram_chat_id: 1 });
    const due = dueForReminder(
      [row(1, "2026-10-31", "00:34:00"), row(2, "2026-10-31", "00:35:00"), row(3, "2026-10-31", "01:05:00"), row(4, "2026-10-31", "01:06:00")],
      LATE
    );
    expect(due.map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("sendDueReminders", () => {
  function fakeSupabase(claims: unknown[][]) {
    const candidates = [{ id: 9, date: "2026-10-31", start_time: "00:50:00", telegram_chat_id: 555 }];
    let claimCalls = 0;
    return {
      from(table: string) {
        const q: Record<string, unknown> = {};
        let updating = false;
        for (const m of ["eq", "not", "is", "in"]) q[m] = () => q;
        q.select = () => {
          if (updating) return Promise.resolve({ data: claims[claimCalls++] ?? [], error: null });
          return table === "reservations" ? Object.assign(q, { then: (r: (v: unknown) => void) => r({ data: candidates, error: null }) }) : q;
        };
        q.update = () => {
          updating = true;
          return q;
        };
        q.maybeSingle = async () => ({ data: { lang: "kk" }, error: null });
        return q;
      },
    } as unknown as SupabaseClient;
  }

  it("sends once, even when the job runs again inside the window", async () => {
    const send = vi.fn(async () => 1);
    const supabase = fakeSupabase([[{ id: 9 }], []]);
    expect(await sendDueReminders(LATE, { supabase, send })).toBe(1);
    expect(await sendDueReminders(LATE, { supabase, send })).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([
      555,
      "Еске салу: бүгін 00:50-де сізді күтеміз.",
      { inline_keyboard: [[{ text: "Бас тарту / Отменить бронь", callback_data: "cancel:9" }]] },
    ]);
  });
});

describe("GET /api/cron/reminders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a call without the cron secret (401)", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("../app/api/cron/reminders/route");
    const res = await GET(new NextRequest("http://localhost/api/cron/reminders"));
    expect(res.status).toBe(401);
    const wrong = await GET(new NextRequest("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer nope" } }));
    expect(wrong.status).toBe(401);
  });
});

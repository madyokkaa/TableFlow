import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso, timeToMinutes } from "@/lib/scheduling";
import type { RestaurantClock } from "@/lib/ai/clock";
import { inlineKeyboard } from "@/lib/telegram";
import { texts, type Lang } from "./texts";

export const REMINDER_WINDOW_MIN = 45;
export const REMINDER_WINDOW_MAX = 75;

export type ReminderCandidate = { id: number; date: string; start_time: string; telegram_chat_id: number };

/** Minutes from now until the booking starts, both read as wall-clock time
 * in the restaurant's zone - so "today 00:20" is 40 minutes after "yesterday
 * 23:40". */
export function minutesUntil(date: string, startTime: string, clock: RestaurantClock): number {
  const dayOffset = date === clock.todayIso ? 0 : date === addDaysIso(clock.todayIso, 1) ? 1440 : Number.NaN;
  return dayOffset + timeToMinutes(startTime) - clock.nowMinutes;
}

/** Bookings starting 45-75 minutes from now (the job runs every 10 minutes,
 * so each booking falls in the window on a few runs - the reminder_sent_at
 * claim makes only the first one send). */
export function dueForReminder(rows: ReminderCandidate[], clock: RestaurantClock): ReminderCandidate[] {
  return rows.filter((r) => {
    const m = minutesUntil(r.date, r.start_time, clock);
    return m >= REMINDER_WINDOW_MIN && m <= REMINDER_WINDOW_MAX;
  });
}

export type ReminderDeps = {
  supabase: SupabaseClient;
  send(chatId: number, text: string, markup?: ReturnType<typeof inlineKeyboard>): Promise<number | null>;
};

/** Finds due reminders, claims each one atomically
 * (update … where reminder_sent_at is null returning) and messages only the
 * claimed ones. Returns how many were sent. */
export async function sendDueReminders(clock: RestaurantClock, { supabase, send }: ReminderDeps): Promise<number> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, date, start_time, telegram_chat_id")
    .eq("status", "confirmed")
    .not("telegram_chat_id", "is", null)
    .is("reminder_sent_at", null)
    .in("date", [clock.todayIso, addDaysIso(clock.todayIso, 1)]);
  if (error) throw new Error(`reminder query failed: ${error.code}`);

  let sent = 0;
  for (const r of dueForReminder((data ?? []) as ReminderCandidate[], clock)) {
    const { data: claimed, error: claimError } = await supabase
      .from("reservations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (claimError) {
      console.error("[telegram.reminders] claim failed", { reservationId: r.id, code: claimError.code });
      continue;
    }
    if (!claimed?.length) continue; // another run got it first

    const { data: session } = await supabase.from("telegram_sessions").select("lang").eq("chat_id", r.telegram_chat_id).maybeSingle();
    const lang: Lang = session?.lang === "kk" ? "kk" : "ru";
    const messageId = await send(
      r.telegram_chat_id,
      texts.reminder(lang, r.start_time.slice(0, 5)),
      inlineKeyboard([[{ text: texts.cancelBookingButton, callback_data: `cancel:${r.id}` }]])
    );
    if (messageId !== null) sent++;
  }
  return sent;
}

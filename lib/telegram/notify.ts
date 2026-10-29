import type { SupabaseClient } from "@supabase/supabase-js";
import { inlineKeyboard, sendMessage } from "@/lib/telegram";
import { texts, type Lang } from "./texts";

/** The bits of a reservation the guest-facing messages need. */
export type NotifiableReservation = {
  id: number;
  status: string;
  date: string;
  start_time: string;
  telegram_chat_id: number | null;
  cancellation_reason: string | null;
  hallName: string | null;
};

export type NotifyDeps = {
  send(chatId: number, text: string, markup?: ReturnType<typeof inlineKeyboard>): Promise<number | null>;
  lang(chatId: number): Promise<Lang>;
  markConfirmationSent(reservationId: number): Promise<void>;
};

export type NotifyKind = "confirmed" | "cancelled" | "rescheduled" | null;

/** Which message (if any) a staff edit should send the guest: confirmation
 * on pending → confirmed, a cancellation notice when staff cancel, the new
 * date/time when it moved. Only for bookings that came from Telegram. */
export function notificationFor(before: { status: string; date: string; start_time: string }, after: NotifiableReservation): NotifyKind {
  if (!after.telegram_chat_id) return null;
  if (before.status === "pending" && after.status === "confirmed") return "confirmed";
  if (before.status !== "cancelled" && after.status === "cancelled") return "cancelled";
  const moved = before.date !== after.date || before.start_time.slice(0, 5) !== after.start_time.slice(0, 5);
  if (moved && (after.status === "pending" || after.status === "confirmed")) return "rescheduled";
  return null;
}

/** Tells the guest about a staff change. Never throws: a Telegram outage
 * must not turn a successful edit into an error (failures are logged with
 * the reservation id and a code only). */
export async function notifyGuestOfStaffChange(
  before: { status: string; date: string; start_time: string },
  after: NotifiableReservation,
  deps: NotifyDeps
): Promise<NotifyKind> {
  const kind = notificationFor(before, after);
  if (!kind) return null;
  try {
    const chatId = after.telegram_chat_id!;
    const lang = await deps.lang(chatId);
    const time = after.start_time.slice(0, 5);
    if (kind === "confirmed") {
      const sent = await deps.send(
        chatId,
        texts.confirmed(lang, after.date, time, after.hallName),
        inlineKeyboard([[{ text: texts.cancelBookingButton, callback_data: `cancel:${after.id}` }]])
      );
      if (sent !== null) await deps.markConfirmationSent(after.id);
    } else if (kind === "cancelled") {
      await deps.send(chatId, texts.cancelledByRestaurant(lang, after.cancellation_reason));
    } else {
      await deps.send(chatId, texts.rescheduled(lang, after.date, time, after.hallName));
    }
  } catch (err) {
    console.error("[telegram.notify] failed", { reservationId: after.id, kind, name: (err as Error)?.name });
  }
  return kind;
}

/** The production wiring for notifyGuestOfStaffChange. */
export function supabaseNotifyDeps(supabase: SupabaseClient): NotifyDeps {
  return {
    send: sendMessage,
    async lang(chatId) {
      const { data } = await supabase.from("telegram_sessions").select("lang").eq("chat_id", chatId).maybeSingle();
      return data?.lang === "ru" ? "ru" : data?.lang === "kk" ? "kk" : "ru";
    },
    async markConfirmationSent(reservationId) {
      const { error } = await supabase
        .from("reservations")
        .update({ confirmation_notified_at: new Date().toISOString() })
        .eq("id", reservationId);
      if (error) console.error("[telegram.notify] saving confirmation_notified_at failed", { reservationId, code: error.code });
    },
  };
}

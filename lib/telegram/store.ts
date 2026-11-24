import { createAdminClient } from "@/lib/supabase/admin";
import { loadDayAvailability, nearestFreeTimes, pickTable } from "@/lib/availability";
import { linkAiRequests } from "@/lib/ai/log";
import { ALLOWED_STATUS_TRANSITIONS, mapRpcError, type ReservationStatus } from "@/lib/reservations";
import { DEFAULT_DURATION_MINUTES, timeToMinutes } from "@/lib/scheduling";
import { logAudit } from "@/lib/audit";
import type { RestaurantClock } from "@/lib/ai/clock";

export type NewBooking = {
  chatId: number;
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone: string;
  transcript: string;
  consentAt: string | null;
  aiRequestIds: number[];
};

export type CreateResult = { ok: true; reservationId: number } | { ok: false; reason: "no_table" | "taken" | "error" };
export type CancelResult = "cancelled" | "not_allowed" | "error";

/** The bot's side effects on bookings, behind an interface so the dialogue
 * can be tested without a database. */
export type BookingStore = {
  /** Free times near `time` that day (excluding `time` itself). */
  freeTimes(date: string, time: string, partySize: number, clock: RestaurantClock): Promise<string[]>;
  create(booking: NewBooking): Promise<CreateResult>;
  cancel(reservationId: number, chatId: number, clock: RestaurantClock): Promise<CancelResult>;
};

export const supabaseBookingStore: BookingStore = {
  async freeTimes(date, time, partySize, clock) {
    const day = await loadDayAvailability(createAdminClient(), { date, partySize });
    return nearestFreeTimes(day, time, { notBeforeMinutes: date === clock.todayIso ? clock.nowMinutes : -1 });
  },

  async create(b) {
    const supabase = createAdminClient();
    let tableId: number;
    try {
      const day = await loadDayAvailability(supabase, { date: b.date, partySize: b.partySize });
      const table = pickTable(day, b.time);
      if (!table) return { ok: false, reason: "no_table" };
      tableId = table.id;
    } catch (err) {
      console.error("[telegram.booking] availability failed", { name: (err as Error)?.name });
      return { ok: false, reason: "error" };
    }

    const { data: reservationId, error: rpcError } = await supabase.rpc("create_reservation", {
      p_date: b.date,
      p_start_time: b.time,
      p_duration_minutes: DEFAULT_DURATION_MINUTES,
      p_guest_user_id: null,
      p_guest_name: b.name,
      p_guest_phone: b.phone,
      p_guest_email: null,
      p_party_size: b.partySize,
      p_created_by: null,
      p_table_ids: [tableId],
    });
    if (rpcError) {
      // Someone else got the table between the check and the insert - the
      // EXCLUDE constraint decides, as for the website.
      if (mapRpcError(rpcError).status === 409) return { ok: false, reason: "taken" };
      console.error("[telegram.booking] create_reservation failed", { code: rpcError.code });
      return { ok: false, reason: "error" };
    }

    const id = reservationId as number;
    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        source: "telegram_ai",
        ai_transcript: b.transcript.slice(0, 2000) || null,
        telegram_chat_id: b.chatId,
        consent_at: b.consentAt,
      })
      .eq("id", id);
    if (updateError) console.error("[telegram.booking] saving telegram fields failed", { reservationId: id, code: updateError.code });

    await linkAiRequests(b.aiRequestIds, id);
    return { ok: true, reservationId: id };
  },

  async cancel(reservationId, chatId, clock) {
    const supabase = createAdminClient();
    const { data: r, error } = await supabase
      .from("reservations")
      .select("id, status, date, start_time, telegram_chat_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (error) {
      console.error("[telegram.cancel] lookup failed", { reservationId, code: error.code });
      return "error";
    }
    // Only from the chat that made it, only while it's still ahead.
    if (!r || r.telegram_chat_id !== chatId) return "not_allowed";
    const allowed = ALLOWED_STATUS_TRANSITIONS[r.status as ReservationStatus] ?? [];
    const upcoming = r.date > clock.todayIso || (r.date === clock.todayIso && timeToMinutes(r.start_time) > clock.nowMinutes);
    if (!allowed.includes("cancelled") || !upcoming) return "not_allowed";

    const { error: rpcError } = await supabase.rpc("update_reservation", { p_reservation_id: reservationId, p_status: "cancelled" });
    if (rpcError) {
      console.error("[telegram.cancel] update_reservation failed", { reservationId, code: rpcError.code });
      return mapRpcError(rpcError).status === 409 ? "not_allowed" : "error";
    }
    const { error: metaError } = await supabase.from("reservations").update({ cancelled_by: "guest" }).eq("id", reservationId);
    if (metaError) console.error("[telegram.cancel] saving cancelled_by failed", { reservationId, code: metaError.code });

    await logAudit(supabase, {
      actor: null,
      role: "guest",
      action: "reservation.cancelled",
      entity: "reservation",
      entityId: reservationId,
      details: { from: r.status, to: "cancelled", by: "guest", via: "telegram" },
    });
    return "cancelled";
  },
};

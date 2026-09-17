import type { SupabaseClient } from "@supabase/supabase-js";
import { restaurantTodayIso, addDaysIso } from "@/lib/scheduling";

// How long a fully-resolved reservation (completed/cancelled/no-show) is
// kept before it's hard-deleted. Long enough that the dashboard's 30-day
// trend view is never looking at a partially-cleaned window; the guest
// booking window itself is bounded to 90 days (MAX_ADVANCE_BOOKING_DAYS), so
// this keeps roughly one full booking cycle of history.
export const STALE_RESERVATION_RETENTION_DAYS = 90;

/** A reservation's time is measured on the same "UTC wall-clock" convention
 * the DB itself uses to build reservation_tables.time_range (see the
 * 20260911183730 migration's sync_reservation_tables trigger) - date and
 * start_time are stored and compared as literal UTC, not converted from
 * restaurant-local first. Matching that convention here (rather than
 * "correctly" applying RESTAURANT_UTC_OFFSET_MINUTES) keeps this in sync
 * with the EXCLUDE constraint's own notion of when a reservation ends. */
function reservationEndMs(date: string, startTime: string, durationMinutes: number): number {
  return Date.parse(`${date}T${startTime}Z`) + durationMinutes * 60_000;
}

/** Reservations whose time has fully passed are no longer "active" even if
 * staff never touched them. A `confirmed` one moves to `completed` (assume
 * the visit happened unless a hostess marks it no-show some other way); a
 * `pending` one that was never confirmed moves to `cancelled` - the only
 * transition pending is allowed to make, per the DB's own status-transition
 * trigger. Idempotent and non-destructive, so it's safe to call
 * opportunistically on reads, not just before a delete. */
export async function completeExpiredReservations(supabase: SupabaseClient): Promise<void> {
  const today = restaurantTodayIso();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, date, start_time, duration_minutes, status")
    .in("status", ["pending", "confirmed"])
    .lte("date", today);
  if (error) throw error;

  const now = Date.now();
  const toComplete: number[] = [];
  const toCancel: number[] = [];
  for (const r of data ?? []) {
    if (reservationEndMs(r.date, r.start_time, r.duration_minutes) >= now) continue;
    (r.status === "confirmed" ? toComplete : toCancel).push(r.id);
  }

  if (toComplete.length) {
    const { error: updateError } = await supabase.from("reservations").update({ status: "completed" }).in("id", toComplete);
    if (updateError) throw updateError;
  }
  if (toCancel.length) {
    const { error: updateError } = await supabase.from("reservations").update({ status: "cancelled" }).in("id", toCancel);
    if (updateError) throw updateError;
  }
}

/** Permanently removes reservations resolved (completed/cancelled/no-show)
 * more than STALE_RESERVATION_RETENTION_DAYS ago. reservation_tables rows
 * cascade-delete with them, which is what actually frees a dining table to
 * be hard-deleted - a table stays FK-blocked for as long as any reservation
 * ever assigned to it still exists, active or not. Returns how many were
 * removed. */
export async function deleteStaleReservations(supabase: SupabaseClient): Promise<number> {
  const cutoff = addDaysIso(restaurantTodayIso(), -STALE_RESERVATION_RETENTION_DAYS);
  const { error, count } = await supabase
    .from("reservations")
    .delete({ count: "exact" })
    .lt("date", cutoff)
    .in("status", ["completed", "cancelled", "no-show"]);
  if (error) throw error;
  return count ?? 0;
}

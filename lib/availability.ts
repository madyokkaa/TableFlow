import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSE_HOUR, DEFAULT_DURATION_MINUTES, OPEN_HOUR, rangesOverlap, timeToMinutes } from "@/lib/scheduling";

export type AvailableTable = {
  id: number;
  hall_id: number;
  label: string;
  max_capacity: number;
  manual_status: string | null;
  halls: { name: string } | null;
};

export type ActiveBooking = { table_id: number; start_time: string; duration_minutes: number };

export type DayAvailability = { tables: AvailableTable[]; bookings: ActiveBooking[] };

/** One of the two availability queries failed; `step` says which. */
export class AvailabilityQueryError extends Error {
  constructor(
    public readonly step: "tables" | "bookings",
    public readonly cause: unknown
  ) {
    super(`${step} query failed`);
    this.name = "AvailabilityQueryError";
  }
}

/** Everything needed to answer "which table is free when" for one day: the
 * tables that can seat the party (active, not out of service, big enough)
 * and the day's active bookings. Two queries, run in parallel. Shared by
 * GET /api/availability and the Telegram bot so both see the same floor. */
export async function loadDayAvailability(
  supabase: SupabaseClient,
  { date, partySize, tableId = null }: { date: string; partySize: number; tableId?: number | null }
): Promise<DayAvailability> {
  // manual_status='out_of_service' takes a table out of the rotation
  // entirely. 'occupied' is a transient walk-in marker for *today*, not a
  // blanket future unavailability, so it doesn't filter here.
  let tablesQuery = supabase
    .from("dining_tables")
    .select("id, hall_id, label, max_capacity, manual_status, halls(name)")
    .eq("is_active", true)
    .gte("max_capacity", partySize)
    .or("manual_status.is.null,manual_status.eq.occupied");
  if (tableId !== null) {
    tablesQuery = tablesQuery.eq("id", tableId);
  }
  let bookingsQuery = supabase
    .from("reservation_tables")
    .select("table_id, reservations!inner(date, start_time, duration_minutes, status)")
    .eq("reservations.date", date)
    .in("reservations.status", ["pending", "confirmed"]);
  if (tableId !== null) {
    bookingsQuery = bookingsQuery.eq("table_id", tableId);
  }
  const [{ data: tables, error: tablesError }, { data: bookings, error: bookingsError }] = await Promise.all([
    tablesQuery,
    bookingsQuery,
  ]);
  if (tablesError) throw new AvailabilityQueryError("tables", tablesError);
  if (bookingsError) throw new AvailabilityQueryError("bookings", bookingsError);

  return {
    tables: tables as unknown as AvailableTable[],
    bookings: (
      bookings as unknown as { table_id: number; reservations: { start_time: string; duration_minutes: number } }[]
    ).map((row) => ({
      table_id: row.table_id,
      start_time: row.reservations.start_time,
      duration_minutes: row.reservations.duration_minutes,
    })),
  };
}

/** No active booking on this table overlaps [start, start + duration). */
export function tableIsFree(
  tableId: number,
  bookings: ActiveBooking[],
  startMinutes: number,
  durationMinutes: number = DEFAULT_DURATION_MINUTES
): boolean {
  const end = startMinutes + durationMinutes;
  return !bookings.some((b) => {
    if (b.table_id !== tableId) return false;
    const bStart = timeToMinutes(b.start_time);
    return rangesOverlap(startMinutes, end, bStart, bStart + b.duration_minutes);
  });
}

/** The smallest free table that seats the party at `time`, so big tables
 * stay available for big parties. Null when nothing fits. */
export function pickTable(day: DayAvailability, time: string): AvailableTable | null {
  const start = timeToMinutes(time);
  const free = day.tables
    .filter((t) => tableIsFree(t.id, day.bookings, start))
    .sort((a, b) => a.max_capacity - b.max_capacity || a.label.localeCompare(b.label));
  return free[0] ?? null;
}

const GRID_MINUTES = 30;

/** Up to `count` free start times on the same day nearest to `time`, on a
 * half-hour grid inside opening hours (the visit must end by closing), never
 * earlier than `notBeforeMinutes` - returned in clock order. */
export function nearestFreeTimes(
  day: DayAvailability,
  time: string,
  { count = 3, notBeforeMinutes = -1 }: { count?: number; notBeforeMinutes?: number } = {}
): string[] {
  const wanted = timeToMinutes(time);
  const candidates: number[] = [];
  for (let m = OPEN_HOUR * 60; m + DEFAULT_DURATION_MINUTES <= CLOSE_HOUR * 60; m += GRID_MINUTES) {
    if (m <= notBeforeMinutes || m === wanted) continue;
    if (day.tables.some((t) => tableIsFree(t.id, day.bookings, m))) candidates.push(m);
  }
  return candidates
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

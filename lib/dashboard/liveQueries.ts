import type { SupabaseClient } from "@supabase/supabase-js";
import { restaurantTodayIso, restaurantNowMinutes, timeToMinutes } from "@/lib/scheduling";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/lib/reservations";
import { isMissingSchemaError } from "@/lib/schemaErrors";
import { parseTstzRange } from "./dateUtils";
import type { LiveTableState, StatusCounts } from "./types";

function emptyStatusCounts(): StatusCounts {
  return Object.fromEntries(RESERVATION_STATUSES.map((s) => [s, 0])) as StatusCounts;
}

/** Today's reservations, broken down by status. */
export async function getTodaySummary(supabase: SupabaseClient) {
  const today = restaurantTodayIso();
  const { data, error } = await supabase.from("reservations").select("status").eq("date", today);
  if (error) throw error;

  const byStatus = emptyStatusCounts();
  for (const row of data ?? []) {
    const status = row.status as ReservationStatus;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return { total: data?.length ?? 0, byStatus };
}

type OccupiedTable = { id: number; hall_id: number; manual_status: string | null };

/** Ids of tables with a pending/confirmed booking covering this instant.
 * The database answers this directly (tables_reserved_now, index-backed);
 * on a database without that function yet it falls back to reading every
 * active reservation_tables row and checking the time here. */
async function tablesReservedNow(supabase: SupabaseClient): Promise<Set<number>> {
  const { data, error } = await supabase.rpc("tables_reserved_now");
  if (!error) return new Set((data as number[] | null) ?? []);
  if (!isMissingSchemaError(error)) throw error;

  const { data: activeRows, error: rtError } = await supabase
    .from("reservation_tables")
    .select("table_id, time_range")
    .in("status", ["pending", "confirmed"]);
  if (rtError) throw rtError;
  const now = Date.now();
  const reservedNow = new Set<number>();
  for (const row of activeRows ?? []) {
    const bounds = parseTstzRange(String(row.time_range));
    if (bounds && now >= bounds.start && now < bounds.end) reservedNow.add(row.table_id as number);
  }
  return reservedNow;
}

/** Which active tables are occupied *right now* - either a staff walk-in
 * override (`manual_status`) or a pending/confirmed reservation whose time
 * range contains this instant. Returns the raw table list too, so
 * getHallOccupancy can group the same computation by hall without a second
 * round trip. */
export async function getOccupancyNow(supabase: SupabaseClient) {
  const [{ data: tables, error: tablesError }, reservedNow] = await Promise.all([
    supabase.from("dining_tables").select("id, hall_id, is_active, manual_status"),
    tablesReservedNow(supabase),
  ]);
  if (tablesError) throw tablesError;

  const active: OccupiedTable[] = (tables ?? []).filter((t) => t.is_active);
  let occupied = 0;
  let outOfService = 0;
  for (const t of active) {
    if (t.manual_status === "out_of_service") outOfService += 1;
    else if (t.manual_status === "occupied" || reservedNow.has(t.id)) occupied += 1;
  }

  return {
    totalActive: active.length,
    occupied,
    outOfService,
    free: active.length - occupied - outOfService,
    tables: active,
    reservedNow,
  };
}

/** Each active table as free / busy / off (out of service), from the same
 * getOccupancyNow result - out-of-service wins over a reservation, exactly
 * as the occupied/outOfService counts above treat it. */
export function liveTableStates(occupancy: Pick<Awaited<ReturnType<typeof getOccupancyNow>>, "tables" | "reservedNow">): LiveTableState[] {
  return occupancy.tables.map((t) => ({
    id: t.id,
    hallId: t.hall_id,
    state:
      t.manual_status === "out_of_service"
        ? "off"
        : t.manual_status === "occupied" || occupancy.reservedNow.has(t.id)
          ? "busy"
          : "free",
  }));
}

/** Per-hall occupancy, derived from getOccupancyNow's result so the "which
 * tables are occupied" logic lives in exactly one place. */
export async function getHallOccupancy(
  supabase: SupabaseClient,
  occupancy: Awaited<ReturnType<typeof getOccupancyNow>>
) {
  const { data: halls, error } = await supabase.from("halls").select("id, name").order("name");
  if (error) throw error;

  return (halls ?? []).map((hall) => {
    const hallTables = occupancy.tables.filter((t) => t.hall_id === hall.id);
    const occupied = hallTables.filter(
      (t) => t.manual_status === "occupied" || occupancy.reservedNow.has(t.id)
    ).length;
    const total = hallTables.length;
    return {
      hallId: hall.id as number,
      name: hall.name as string,
      totalTables: total,
      occupied,
      percent: total ? Math.round((occupied / total) * 100) : 0,
    };
  });
}

type ReservationTableRow = { dining_tables: { label: string }[] | null };

/** The next handful of today's still-upcoming pending/confirmed reservations,
 * ordered by start time. A small grace window keeps a reservation that just
 * started from disappearing off the list mid-seating. */
export async function getUpcoming(supabase: SupabaseClient, limit = 6) {
  const today = restaurantTodayIso();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, start_time, guest_name, party_size, status, reservation_tables(dining_tables(label))")
    .eq("date", today)
    .in("status", ["pending", "confirmed"])
    .order("start_time");
  if (error) throw error;

  const nowMinutes = restaurantNowMinutes();
  return (data ?? [])
    .filter((r) => timeToMinutes(String(r.start_time)) >= nowMinutes - 15)
    .slice(0, limit)
    .map((r) => ({
      id: r.id as number,
      startTime: String(r.start_time).slice(0, 5),
      guestName: r.guest_name as string,
      partySize: r.party_size as number,
      status: r.status as string,
      tables: ((r.reservation_tables ?? []) as ReservationTableRow[])
        .flatMap((rt) => rt.dining_tables ?? [])
        .map((dt) => dt.label)
        .filter((label): label is string => !!label),
    }));
}

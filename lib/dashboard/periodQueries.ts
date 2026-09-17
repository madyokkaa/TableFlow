import type { SupabaseClient } from "@supabase/supabase-js";
import { restaurantTodayIso, addDaysIso, OPEN_HOUR, CLOSE_HOUR } from "@/lib/scheduling";
import type { StatusCounts } from "./types";

const RESOLVED_STATUSES = ["confirmed", "no-show", "completed"];

/** No-show rate and average party size for the trailing 7 days, each paired
 * with the 7 days before that so the dashboard can show a trend arrow. */
export async function getWeeklyKpis(supabase: SupabaseClient) {
  const today = restaurantTodayIso();
  const currentStart = addDaysIso(today, -6);
  const prevStart = addDaysIso(today, -13);
  const prevEnd = addDaysIso(today, -7);

  const { data, error } = await supabase
    .from("reservations")
    .select("date, status, party_size")
    .gte("date", prevStart)
    .lte("date", today);
  if (error) throw error;

  const rows = data ?? [];
  const current = rows.filter((r) => r.date >= currentStart);
  const previous = rows.filter((r) => r.date >= prevStart && r.date <= prevEnd);

  function noShowRate(set: typeof rows) {
    const resolved = set.filter((r) => RESOLVED_STATUSES.includes(r.status));
    if (!resolved.length) return 0;
    return Math.round((resolved.filter((r) => r.status === "no-show").length / resolved.length) * 100);
  }
  function avgPartySize(set: typeof rows) {
    const relevant = set.filter((r) => r.status !== "cancelled");
    if (!relevant.length) return 0;
    return Math.round((relevant.reduce((sum, r) => sum + r.party_size, 0) / relevant.length) * 10) / 10;
  }

  return {
    noShowRate: noShowRate(current),
    noShowRatePrev: noShowRate(previous),
    avgPartySize: avgPartySize(current),
    avgPartySizePrev: avgPartySize(previous),
  };
}

/** Daily status-stacked booking trend, hour-of-day distribution, and the
 * registered-vs-anonymous guest split, all over the same `days`-long window
 * (a single reservations scan feeds all three, since they share the range). */
export async function getPeriodStats(supabase: SupabaseClient, days: number) {
  const today = restaurantTodayIso();
  const startIso = addDaysIso(today, -(days - 1));

  const { data, error } = await supabase
    .from("reservations")
    .select("date, start_time, status, guest_user_id")
    .gte("date", startIso)
    .lte("date", today);
  if (error) throw error;
  const rows = data ?? [];

  const byDate = new Map<string, StatusCounts>();
  for (let i = 0; i < days; i++) {
    const iso = addDaysIso(startIso, i);
    byDate.set(iso, { pending: 0, confirmed: 0, cancelled: 0, "no-show": 0, completed: 0 });
  }
  const byHour = new Map<number, number>();
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) byHour.set(h, 0);

  let withAccount = 0;
  let anonymous = 0;

  for (const row of rows) {
    const counts = byDate.get(row.date);
    if (counts) counts[row.status as keyof StatusCounts] += 1;

    if (row.status !== "cancelled") {
      const hour = Number(String(row.start_time).slice(0, 2));
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
      if (row.guest_user_id) withAccount += 1;
      else anonymous += 1;
    }
  }

  const trend = Array.from(byDate.entries()).map(([date, counts]) => ({ date, ...counts }));
  const hourly = Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));

  return { trend, hourly, guestOrigin: { withAccount, anonymous, total: withAccount + anonymous } };
}

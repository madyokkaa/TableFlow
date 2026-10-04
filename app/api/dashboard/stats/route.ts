import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { getTodaySummary, getOccupancyNow, getHallOccupancy, getUpcoming, liveTableStates } from "@/lib/dashboard/liveQueries";
import { getWeeklyKpis, getPeriodStats } from "@/lib/dashboard/periodQueries";
import type { DashboardStats } from "@/lib/dashboard/types";
import { completeExpiredReservations } from "@/lib/reservationCleanup";

const VALID_PERIODS = [7, 30] as const;

// Staff-only: every metric behind the /hostess/dashboard screen, in one
// round trip. Live figures (today, occupancy, halls, upcoming) are always
// current; trend/hourly/guestOrigin follow the requested `period`.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = Number(searchParams.get("period") ?? 7);
  const period = (VALID_PERIODS as readonly number[]).includes(periodParam)
    ? (periodParam as (typeof VALID_PERIODS)[number])
    : 7;

  const supabase = createAdminClient();
  try {
    // Two independent chains in parallel. Past-due pending/confirmed
    // reservations shouldn't read as still active in "Брони сегодня" or the
    // trend/no-show aggregates, so those wait for the clean-up; the live
    // floor figures don't need to - a booking whose time has passed covers
    // no "now" anyway.
    const [[today, weekly, periodStats, upcoming], [occupancy, halls]] = await Promise.all([
      completeExpiredReservations(supabase).then(() =>
        Promise.all([getTodaySummary(supabase), getWeeklyKpis(supabase), getPeriodStats(supabase, period), getUpcoming(supabase)])
      ),
      getOccupancyNow(supabase).then(async (occ) => [occ, await getHallOccupancy(supabase, occ)] as const),
    ]);

    const body: DashboardStats = {
      period,
      today,
      occupancy: {
        totalActive: occupancy.totalActive,
        occupied: occupancy.occupied,
        outOfService: occupancy.outOfService,
        free: occupancy.free,
      },
      weekly,
      trend: periodStats.trend,
      hourly: periodStats.hourly,
      guestOrigin: periodStats.guestOrigin,
      upcoming,
      halls,
      liveTables: liveTableStates(occupancy),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[dashboard.stats] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
}

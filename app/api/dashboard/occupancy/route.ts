import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { getOccupancyNow } from "@/lib/dashboard/liveQueries";
import type { OccupancyNow } from "@/lib/dashboard/types";

// Staff-only: just the live "how full is the floor right now" figure that the
// panel's sidebar shows on every page. Kept separate from
// /api/dashboard/stats, which also computes period aggregates and is far too
// heavy to refetch on every reservation change from every page.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  try {
    const occupancy = await getOccupancyNow(createAdminClient());
    const body: OccupancyNow = {
      totalActive: occupancy.totalActive,
      occupied: occupancy.occupied,
      outOfService: occupancy.outOfService,
      free: occupancy.free,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[dashboard.occupancy] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

export async function GET(request: NextRequest, context: { params: Promise<{ date: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { date } = await context.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, slots!inner(date, start_time, restaurant_tables(number, zone))")
    .eq("slots.date", date)
    .order("start_time", { referencedTable: "slots" });

  if (error) {
    console.error("[bookings.byDate] query failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data);
}

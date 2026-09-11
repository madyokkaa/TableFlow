import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);

type SlotRow = {
  id: number;
  table_id: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  restaurant_tables: { number: number; zone: string; capacity: number } | null;
  bookings: { status: string }[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const partySizeStr = searchParams.get("party_size");

  if (!dateStr) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(Date.parse(dateStr))) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  if (!partySizeStr) {
    return NextResponse.json({ error: "party_size is required" }, { status: 400 });
  }
  const partySize = Number(partySizeStr);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
    return NextResponse.json({ error: "party_size must be a positive integer (max 100)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("slots")
    .select("id, table_id, date, start_time, duration_minutes, restaurant_tables!inner(number, zone, capacity), bookings(status)")
    .eq("date", dateStr)
    .gte("restaurant_tables.capacity", partySize);

  if (error) {
    console.error("[availability] query failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const slots = (data ?? []) as unknown as SlotRow[];

  const available = slots
    .filter((slot) => !slot.bookings.some((b) => ACTIVE_STATUSES.has(b.status)))
    .map((slot) => ({
      slot_id: slot.id,
      table_id: slot.table_id,
      table_number: slot.restaurant_tables?.number,
      zone: slot.restaurant_tables?.zone,
      capacity: slot.restaurant_tables?.capacity,
      date: slot.date,
      start_time: slot.start_time,
      duration_minutes: slot.duration_minutes,
    }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || (a.table_number ?? 0) - (b.table_number ?? 0));

  return NextResponse.json(available);
}

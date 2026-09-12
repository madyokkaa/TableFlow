import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_DURATION_MINUTES,
  candidateStartTimes,
  rangesOverlap,
  restaurantNowMinutes,
  restaurantTodayIso,
  timeToMinutes,
} from "@/lib/scheduling";

type TableRow = {
  id: number;
  hall_id: number;
  label: string;
  max_capacity: number;
  manual_status: string | null;
  halls: { name: string } | null;
};

type ActiveReservation = { table_id: number; start_time: string; duration_minutes: number };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const partySizeStr = searchParams.get("party_size");
  const tableIdStr = searchParams.get("table_id");

  let tableId: number | null = null;
  if (tableIdStr) {
    tableId = Number(tableIdStr);
    if (!Number.isInteger(tableId) || tableId <= 0 || tableId > Number.MAX_SAFE_INTEGER) {
      return NextResponse.json({ error: "table_id должен быть целым числом" }, { status: 400 });
    }
  }

  if (!dateStr) {
    return NextResponse.json({ error: "укажите дату (ГГГГ-ММ-ДД)" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(Date.parse(dateStr))) {
    return NextResponse.json({ error: "формат даты: ГГГГ-ММ-ДД" }, { status: 400 });
  }

  if (!partySizeStr) {
    return NextResponse.json({ error: "укажите число гостей" }, { status: 400 });
  }
  const partySize = Number(partySizeStr);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
    return NextResponse.json({ error: "число гостей должно быть положительным целым (не более 100)" }, { status: 400 });
  }

  const supabase = createAdminClient();

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
  const { data: tables, error: tablesError } = await tablesQuery;

  if (tablesError) {
    console.error("[availability] table query failed", tablesError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  const tableIds = (tables as unknown as TableRow[]).map((t) => t.id);
  let activeReservations: ActiveReservation[] = [];
  if (tableIds.length > 0) {
    const { data, error } = await supabase
      .from("reservation_tables")
      .select("table_id, reservations!inner(date, start_time, duration_minutes, status)")
      .in("table_id", tableIds)
      .eq("reservations.date", dateStr)
      .in("reservations.status", ["pending", "confirmed"]);

    if (error) {
      console.error("[availability] reservation query failed", error);
      return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
    }
    activeReservations = (data as unknown as { table_id: number; reservations: { start_time: string; duration_minutes: number } }[]).map(
      (row) => ({ table_id: row.table_id, start_time: row.reservations.start_time, duration_minutes: row.reservations.duration_minutes })
    );
  }

  // "No bookings in the past" - compared in the restaurant's own local
  // time, not the server's UTC. Comparing a restaurant wall-clock slot
  // against UTC-of-day silently offered (and let the DB accept) slots that
  // had already passed for any restaurant not in UTC+0.
  const isToday = dateStr === restaurantTodayIso();
  const nowMinutesLocal = restaurantNowMinutes();

  const candidates = candidateStartTimes().filter((start) => !isToday || timeToMinutes(start) > nowMinutesLocal);
  const available: {
    table_id: number;
    hall_id: number;
    hall_name: string | null;
    table_label: string;
    capacity: number;
    date: string;
    start_time: string;
    duration_minutes: number;
  }[] = [];

  for (const table of tables as unknown as TableRow[]) {
    const tableReservations = activeReservations.filter((r) => r.table_id === table.id);
    for (const start of candidates) {
      const startMin = timeToMinutes(start);
      const endMin = startMin + DEFAULT_DURATION_MINUTES;
      const conflict = tableReservations.some((r) => {
        const rStart = timeToMinutes(r.start_time);
        const rEnd = rStart + r.duration_minutes;
        return rangesOverlap(startMin, endMin, rStart, rEnd);
      });
      if (!conflict) {
        available.push({
          table_id: table.id,
          hall_id: table.hall_id,
          hall_name: table.halls?.name ?? null,
          table_label: table.label,
          capacity: table.max_capacity,
          date: dateStr,
          start_time: start,
          duration_minutes: DEFAULT_DURATION_MINUTES,
        });
      }
    }
  }

  available.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.table_label.localeCompare(b.table_label));

  return NextResponse.json(available);
}

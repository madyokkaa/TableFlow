import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestTimeZone } from "@/lib/requestTimeZone";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rateLimit";
import {
  DEFAULT_DURATION_MINUTES,
  candidateStartTimes,
  restaurantNowMinutes,
  restaurantTodayIso,
  timeToMinutes,
} from "@/lib/scheduling";
import { AvailabilityQueryError, loadDayAvailability, tableIsFree, type DayAvailability } from "@/lib/availability";

export async function GET(request: NextRequest) {
  // Counted now, awaited together with the availability queries below - one
  // round trip to the database instead of two in a row.
  const limitCheck = checkRateLimit(request, "availability", RATE_LIMITS.availability);

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const partySizeStr = searchParams.get("party_size");
  const tableIdStr = searchParams.get("table_id");

  let tableId: number | null = null;
  if (tableIdStr) {
    tableId = Number(tableIdStr);
    if (!Number.isInteger(tableId) || tableId <= 0 || tableId > Number.MAX_SAFE_INTEGER) {
      return (await limitCheck) ?? NextResponse.json({ error: "table_id должен быть целым числом" }, { status: 400 });
    }
  }

  if (!dateStr) {
    return (await limitCheck) ?? NextResponse.json({ error: "укажите дату (ГГГГ-ММ-ДД)" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(Date.parse(dateStr))) {
    return (await limitCheck) ?? NextResponse.json({ error: "формат даты: ГГГГ-ММ-ДД" }, { status: 400 });
  }

  if (!partySizeStr) {
    return (await limitCheck) ?? NextResponse.json({ error: "укажите число гостей" }, { status: 400 });
  }
  const partySize = Number(partySizeStr);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
    return (await limitCheck) ?? NextResponse.json({ error: "число гостей должно быть положительным целым (не более 100)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let day: DayAvailability;
  try {
    const [limited, loaded] = await Promise.all([limitCheck, loadDayAvailability(supabase, { date: dateStr, partySize, tableId })]);
    if (limited) return limited;
    day = loaded;
  } catch (err) {
    if (!(err instanceof AvailabilityQueryError)) throw err;
    console.error(
      err.step === "tables" ? "[availability] table query failed" : "[availability] reservation query failed",
      err.cause
    );
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  // "No bookings in the past" - compared in the restaurant's own local
  // time, not the server's UTC. Comparing a restaurant wall-clock slot
  // against UTC-of-day silently offered (and let the DB accept) slots that
  // had already passed for any restaurant not in UTC+0.
  const timeZone = requestTimeZone(request);
  const isToday = dateStr === restaurantTodayIso(timeZone);
  const nowMinutesLocal = restaurantNowMinutes(timeZone);

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

  for (const table of day.tables) {
    for (const start of candidates) {
      if (tableIsFree(table.id, day.bookings, timeToMinutes(start))) {
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

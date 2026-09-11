/**
 * Populates demo restaurant_tables + slots so /api/availability has
 * something to show. No-op if tables already exist. Run with:
 *   npx tsx scripts/seed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const DEMO_TABLES = [
  { number: 1, capacity: 2, zone: "main" },
  { number: 2, capacity: 2, zone: "main" },
  { number: 3, capacity: 4, zone: "main" },
  { number: 4, capacity: 4, zone: "main" },
  { number: 5, capacity: 6, zone: "main" },
  { number: 6, capacity: 2, zone: "terrace" },
  { number: 7, capacity: 4, zone: "terrace" },
];

const OPEN_HOUR = 12;
const CLOSE_HOUR = 22;
// Interval == duration so one table's own slots never overlap each other -
// otherwise multiple slots could each get a "confirmed" booking for the
// same physical seating window, defeating the double-booking guard.
const SLOT_DURATION_MINUTES = 90;
const SLOT_INTERVAL_MINUTES = SLOT_DURATION_MINUTES;
const DAYS_AHEAD = 14;

function slotStartTimes(): string[] {
  const times: string[] = [];
  let minutesFromMidnight = OPEN_HOUR * 60;
  const closeMinutes = CLOSE_HOUR * 60;
  while (minutesFromMidnight <= closeMinutes) {
    const h = Math.floor(minutesFromMidnight / 60)
      .toString()
      .padStart(2, "0");
    const m = (minutesFromMidnight % 60).toString().padStart(2, "0");
    times.push(`${h}:${m}:00`);
    minutesFromMidnight += SLOT_INTERVAL_MINUTES;
  }
  return times;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existing, error: existingError } = await supabase.from("restaurant_tables").select("id").limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    console.log("Demo data already exists, skipping.");
    return;
  }

  const { data: tables, error: tablesError } = await supabase.from("restaurant_tables").insert(DEMO_TABLES).select();
  if (tablesError) throw tablesError;

  const startTimes = slotStartTimes();
  const today = new Date();
  const slots = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const dateStr = date.toISOString().slice(0, 10);
    for (const table of tables!) {
      for (const startTime of startTimes) {
        slots.push({
          table_id: table.id,
          date: dateStr,
          start_time: startTime,
          duration_minutes: SLOT_DURATION_MINUTES,
        });
      }
    }
  }

  const { error: slotsError } = await supabase.from("slots").insert(slots);
  if (slotsError) throw slotsError;

  console.log(`Seeded ${tables!.length} tables and ${slots.length} slots.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

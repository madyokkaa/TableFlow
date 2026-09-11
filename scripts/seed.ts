/**
 * Populates demo halls + dining_tables so /api/availability has something
 * to show and the floor plan isn't empty. No-op if halls already exist.
 * Availability is computed on the fly now (no more pre-generated slots).
 * Run with:
 *   npx tsx scripts/seed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const HALLS = [
  { name: "Main Hall", description: "The main dining room." },
  { name: "Terrace", description: "Outdoor seating, weather permitting." },
];

const MAIN_TABLES = [
  { label: "1", shape: "round" as const, min_capacity: 1, max_capacity: 2, pos_x: 60, pos_y: 60 },
  { label: "2", shape: "round" as const, min_capacity: 1, max_capacity: 2, pos_x: 200, pos_y: 60 },
  { label: "3", shape: "rectangle" as const, min_capacity: 2, max_capacity: 4, pos_x: 60, pos_y: 200 },
  { label: "4", shape: "rectangle" as const, min_capacity: 2, max_capacity: 4, pos_x: 260, pos_y: 200 },
  { label: "5", shape: "rectangle" as const, min_capacity: 4, max_capacity: 6, pos_x: 460, pos_y: 200 },
];

const TERRACE_TABLES = [
  { label: "T1", shape: "square" as const, min_capacity: 1, max_capacity: 2, pos_x: 60, pos_y: 60 },
  { label: "T2", shape: "rectangle" as const, min_capacity: 2, max_capacity: 4, pos_x: 240, pos_y: 60 },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existing, error: existingError } = await supabase.from("halls").select("id").limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    console.log("Demo data already exists, skipping.");
    return;
  }

  const { data: halls, error: hallsError } = await supabase.from("halls").insert(HALLS).select();
  if (hallsError) throw hallsError;

  const [mainHall, terraceHall] = halls!;

  const { error: mainTablesError } = await supabase
    .from("dining_tables")
    .insert(MAIN_TABLES.map((t) => ({ ...t, hall_id: mainHall.id })));
  if (mainTablesError) throw mainTablesError;

  const { error: terraceTablesError } = await supabase
    .from("dining_tables")
    .insert(TERRACE_TABLES.map((t) => ({ ...t, hall_id: terraceHall.id })));
  if (terraceTablesError) throw terraceTablesError;

  console.log(`Seeded ${halls!.length} halls and ${MAIN_TABLES.length + TERRACE_TABLES.length} tables.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

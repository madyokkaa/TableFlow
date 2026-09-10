/**
 * Emulates two simultaneous requests racing for the same last-available
 * slot and verifies only one booking is ever confirmed - the whole point
 * of the DB-level partial unique index (uq_active_booking_per_slot) in
 * supabase/migrations, not just app-level checks.
 *
 * Calls the POST route handler directly (not over HTTP / a running dev
 * server) with two real, distinct authenticated users, fired in parallel.
 */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/bookings/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "Test-Password-123!";

async function createTestGuestSession(email: string) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("user creation failed");

  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("sign-in failed");

  return { userId: created.user.id, accessToken: signIn.session.access_token };
}

function bookingRequest(token: string, slotId: number, guestName: string) {
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ slot_id: slotId, guest_name: guestName, guest_phone: "+10000000001", party_size: 2 }),
  });
}

describe("double-booking protection", () => {
  let tableId: number;
  let slotId: number;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .insert({ number: 90000 + Math.floor(Math.random() * 9000), capacity: 4, zone: "concurrency-test" })
      .select()
      .single();
    if (tableError) throw tableError;
    tableId = table.id;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const dateStr = futureDate.toISOString().slice(0, 10);

    const { data: slot, error: slotError } = await admin
      .from("slots")
      .insert({ table_id: tableId, date: dateStr, start_time: "20:00:00", duration_minutes: 90 })
      .select()
      .single();
    if (slotError) throw slotError;
    slotId = slot.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("slots").delete().eq("id", slotId);
    await admin.from("restaurant_tables").delete().eq("id", tableId);
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 30_000);

  it("confirms exactly one of two simultaneous bookings for the same slot", async () => {
    const suffix = Date.now();
    const [racerA, racerB] = await Promise.all([
      createTestGuestSession(`tableflow-racer-a-${suffix}@example.com`),
      createTestGuestSession(`tableflow-racer-b-${suffix}@example.com`),
    ]);
    createdUserIds.push(racerA.userId, racerB.userId);

    const [responseA, responseB] = await Promise.all([
      POST(bookingRequest(racerA.accessToken, slotId, "Racer A")),
      POST(bookingRequest(racerB.accessToken, slotId, "Racer B")),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const { data: activeBookings, error } = await admin
      .from("bookings")
      .select("id")
      .eq("slot_id", slotId)
      .in("status", ["pending", "confirmed"]);
    if (error) throw error;
    expect(activeBookings).toHaveLength(1);
  }, 30_000);
});

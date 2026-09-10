import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getAvailability } from "../app/api/availability/route";
import { POST as createBooking } from "../app/api/bookings/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const TEST_PASSWORD = "Test-Password-123!";

async function createGuestSession(email: string) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("user creation failed");

  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("sign-in failed");

  return { userId: created.user.id, accessToken: signIn.session.access_token };
}

function bookingRequest(token: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/bookings", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("GET /api/availability", () => {
  let tableId: number;
  let slotId: number;
  let dateStr: string;

  beforeAll(async () => {
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .insert({ number: 91000 + Math.floor(Math.random() * 900), capacity: 4, zone: "api-test" })
      .select()
      .single();
    if (tableError) throw tableError;
    tableId = table.id;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 40);
    dateStr = futureDate.toISOString().slice(0, 10);

    const { data: slot, error: slotError } = await admin
      .from("slots")
      .insert({ table_id: tableId, date: dateStr, start_time: "18:00:00", duration_minutes: 90 })
      .select()
      .single();
    if (slotError) throw slotError;
    slotId = slot.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("slots").delete().eq("id", slotId);
    await admin.from("restaurant_tables").delete().eq("id", tableId);
  }, 30_000);

  it("lists the open slot for a matching party size", async () => {
    const req = new NextRequest(`http://localhost/api/availability?date=${dateStr}&party_size=2`);
    const res = await getAvailability(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((s: { slot_id: number }) => s.slot_id === slotId)).toBe(true);
  });

  it("excludes slots below the requested party size", async () => {
    const req = new NextRequest(`http://localhost/api/availability?date=${dateStr}&party_size=6`);
    const res = await getAvailability(req);
    const body = await res.json();
    expect(body.some((s: { slot_id: number }) => s.slot_id === slotId)).toBe(false);
  });

  it("rejects a missing date/party_size", async () => {
    const res = await getAvailability(new NextRequest("http://localhost/api/availability?party_size=2"));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range party_size", async () => {
    const res = await getAvailability(
      new NextRequest(`http://localhost/api/availability?date=${dateStr}&party_size=999999999999999999999999`)
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/bookings", () => {
  let tableId: number;
  let slotId: number;
  let guest: { userId: string; accessToken: string };

  beforeAll(async () => {
    const { data: table, error: tableError } = await admin
      .from("restaurant_tables")
      .insert({ number: 92000 + Math.floor(Math.random() * 900), capacity: 4, zone: "api-test" })
      .select()
      .single();
    if (tableError) throw tableError;
    tableId = table.id;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 41);
    const dateStr = futureDate.toISOString().slice(0, 10);

    const { data: slot, error: slotError } = await admin
      .from("slots")
      .insert({ table_id: tableId, date: dateStr, start_time: "19:00:00", duration_minutes: 90 })
      .select()
      .single();
    if (slotError) throw slotError;
    slotId = slot.id;

    guest = await createGuestSession(`tableflow-api-test-${Date.now()}@example.com`);
  }, 30_000);

  afterAll(async () => {
    await admin.from("slots").delete().eq("id", slotId);
    await admin.from("restaurant_tables").delete().eq("id", tableId);
    await admin.auth.admin.deleteUser(guest.userId);
  }, 30_000);

  it("rejects an unauthenticated request", async () => {
    const res = await createBooking(
      bookingRequest(null, { slot_id: slotId, guest_name: "A", guest_phone: "+1", party_size: 2 })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a booking with no phone or email", async () => {
    const res = await createBooking(
      bookingRequest(guest.accessToken, { slot_id: slotId, guest_name: "Alice", party_size: 2 })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a party size over table capacity", async () => {
    const res = await createBooking(
      bookingRequest(guest.accessToken, {
        slot_id: slotId,
        guest_name: "Alice",
        guest_phone: "+10000000001",
        party_size: 99,
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates a booking on the happy path", async () => {
    const res = await createBooking(
      bookingRequest(guest.accessToken, {
        slot_id: slotId,
        guest_name: "Alice",
        guest_phone: "+10000000001",
        party_size: 2,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });
});

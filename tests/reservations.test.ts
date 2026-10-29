import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getAvailability } from "../app/api/availability/route";
import { POST as createReservation } from "../app/api/reservations/route";
import { GET as listReservations } from "../app/api/reservations/route";
import { PATCH as patchReservation } from "../app/api/reservations/[id]/route";
import { POST as cancelReservation } from "../app/api/reservations/[id]/cancel/route";
import { POST as createHall } from "../app/api/halls/route";
import { POST as createTable } from "../app/api/tables/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const HOSTESS_EMAIL = process.env.TEST_HOSTESS_EMAIL!;
const HOSTESS_PASSWORD = process.env.TEST_HOSTESS_PASSWORD!;

async function getStaffToken(): Promise<string> {
  if (!HOSTESS_EMAIL || !HOSTESS_PASSWORD) {
    throw new Error("TEST_HOSTESS_EMAIL / TEST_HOSTESS_PASSWORD are not configured (.env.local)");
  }
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: HOSTESS_EMAIL, password: HOSTESS_PASSWORD });
  if (error || !data.session) throw error ?? new Error("staff sign-in failed");
  return data.session.access_token;
}

async function createGuestToken(email: string): Promise<string> {
  const password = "Test-Password-123!";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr || !created.user) throw createErr ?? new Error("guest creation failed");
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("guest sign-in failed");
  return signIn.session.access_token;
}

function jsonRequest(url: string, method: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("halls/tables/reservations API", () => {
  let staffToken: string;
  let hallId: number;
  let tableAId: number;
  let tableBId: number;
  let dateStr: string;
  const guestUserIds: string[] = [];
  const reservationIds: number[] = [];

  beforeAll(async () => {
    staffToken = await getStaffToken();

    const hallRes = await createHall(jsonRequest("/api/halls", "POST", staffToken, { name: `Test Hall ${Date.now()}` }));
    expect(hallRes.status).toBe(201);
    hallId = (await hallRes.json()).id;

    const tableARes = await createTable(
      jsonRequest("/api/tables", "POST", staffToken, { hall_id: hallId, label: "T1", min_capacity: 2, max_capacity: 4 })
    );
    expect(tableARes.status).toBe(201);
    tableAId = (await tableARes.json()).id;

    const tableBRes = await createTable(
      jsonRequest("/api/tables", "POST", staffToken, { hall_id: hallId, label: "T2", min_capacity: 2, max_capacity: 4 })
    );
    expect(tableBRes.status).toBe(201);
    tableBId = (await tableBRes.json()).id;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    dateStr = futureDate.toISOString().slice(0, 10);
  }, 30_000);

  afterAll(async () => {
    // Scoped to the ids this suite actually created - a date-only filter
    // would delete every reservation in the live project dated `dateStr`,
    // including ones this test run never touched.
    if (reservationIds.length > 0) {
      await admin.from("reservation_tables").delete().in("reservation_id", reservationIds);
      await admin.from("reservations").delete().in("id", reservationIds);
    }
    await admin.from("dining_tables").delete().in("id", [tableAId, tableBId]);
    await admin.from("halls").delete().eq("id", hallId);
    for (const id of guestUserIds) await admin.auth.admin.deleteUser(id);
  }, 30_000);

  it("GET /api/availability lists the new table for a matching party size", async () => {
    const res = await getAvailability(jsonRequest(`/api/availability?date=${dateStr}&party_size=2`, "GET", null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((s: { table_id: number }) => s.table_id === tableAId)).toBe(true);
  });

  it("guest can create a reservation, staff can confirm it", async () => {
    const guestEmail = `tf-guest-${Date.now()}@example.com`;
    const guestToken = await createGuestToken(guestEmail);
    guestUserIds.push((await admin.auth.admin.listUsers()).data.users.find((u) => u.email === guestEmail)!.id);

    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", guestToken, {
        table_id: tableAId,
        date: dateStr,
        start_time: "19:00",
        guest_name: "Alice",
        guest_phone: "+10000000001",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);
    expect(reservation.status).toBe("pending");

    const confirmRes = await patchReservation(
      jsonRequest(`/api/reservations/${reservation.id}`, "PATCH", staffToken, { status: "confirmed" }),
      { params: Promise.resolve({ id: String(reservation.id) }) }
    );
    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()).status).toBe("confirmed");
  });

  it("staff can combine two tables for a large party via table_ids", async () => {
    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", await getStaffToken(), {
        table_id: tableAId,
        date: dateStr,
        start_time: "13:00",
        guest_name: "Solo Booker",
        guest_phone: "+10000000002",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);

    const combineRes = await patchReservation(
      jsonRequest(`/api/reservations/${reservation.id}`, "PATCH", staffToken, {
        table_ids: [tableAId, tableBId],
        party_size: 8,
      }),
      { params: Promise.resolve({ id: String(reservation.id) }) }
    );
    expect(combineRes.status).toBe(200);
    const combined = await combineRes.json();
    expect(combined.reservation_tables.map((rt: { table_id: number }) => rt.table_id).sort()).toEqual(
      [tableAId, tableBId].sort()
    );
  });

  it("GET /api/reservations (staff) requires auth and lists results", async () => {
    const unauth = await listReservations(jsonRequest(`/api/reservations?date=${dateStr}`, "GET", null));
    expect(unauth.status).toBe(401);

    const res = await listReservations(jsonRequest(`/api/reservations?date=${dateStr}`, "GET", staffToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  it("rejects a double-booking on the same table/time (409)", async () => {
    const guestEmailA = `tf-conflict-a-${Date.now()}@example.com`;
    const guestEmailB = `tf-conflict-b-${Date.now()}@example.com`;
    const [tokenA, tokenB] = await Promise.all([createGuestToken(guestEmailA), createGuestToken(guestEmailB)]);
    const users = (await admin.auth.admin.listUsers()).data.users;
    guestUserIds.push(users.find((u) => u.email === guestEmailA)!.id, users.find((u) => u.email === guestEmailB)!.id);

    const body = {
      table_id: tableAId,
      date: dateStr,
      start_time: "20:30",
      guest_name: "Racer",
      guest_phone: "+10000000003",
      party_size: 2,
    };
    const [resA, resB] = await Promise.all([
      createReservation(jsonRequest("/api/reservations", "POST", tokenA, body)),
      createReservation(jsonRequest("/api/reservations", "POST", tokenB, { ...body, guest_name: "Racer B" })),
    ]);
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    for (const res of [resA, resB]) {
      if (res.status === 201) reservationIds.push((await res.json()).id);
    }
  });

  it("guest cannot confirm/edit a reservation via the staff PATCH endpoint", async () => {
    const guestEmail = `tf-guest-patch-${Date.now()}@example.com`;
    const guestToken = await createGuestToken(guestEmail);
    guestUserIds.push((await admin.auth.admin.listUsers()).data.users.find((u) => u.email === guestEmail)!.id);

    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", guestToken, {
        table_id: tableAId,
        date: dateStr,
        start_time: "11:00",
        guest_name: "Self Confirm Attempt",
        guest_phone: "+10000000004",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);

    // The exact bug class this reservations model replaced: a guest trying
    // to self-confirm (or edit) their own reservation by calling the
    // staff-only PATCH endpoint directly with their own token.
    const selfConfirmRes = await patchReservation(
      jsonRequest(`/api/reservations/${reservation.id}`, "PATCH", guestToken, { status: "confirmed" }),
      { params: Promise.resolve({ id: String(reservation.id) }) }
    );
    expect(selfConfirmRes.status).toBe(401);

    const { data: stillPending } = await admin.from("reservations").select("status").eq("id", reservation.id).single();
    expect(stillPending?.status).toBe("pending");
  });

  it("an anonymous (unauthenticated) guest can still create a reservation", async () => {
    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", null, {
        table_id: tableAId,
        date: dateStr,
        start_time: "15:00",
        guest_name: "Anonymous Guest",
        guest_phone: "+10000000005",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);
    expect(reservation.guest_user_id).toBeNull();
  });

  it("a guest can cancel their own reservation, but not someone else's", async () => {
    const ownerEmail = `tf-cancel-owner-${Date.now()}@example.com`;
    const strangerEmail = `tf-cancel-stranger-${Date.now()}@example.com`;
    const [ownerToken, strangerToken] = await Promise.all([
      createGuestToken(ownerEmail),
      createGuestToken(strangerEmail),
    ]);
    const users = (await admin.auth.admin.listUsers()).data.users;
    guestUserIds.push(users.find((u) => u.email === ownerEmail)!.id, users.find((u) => u.email === strangerEmail)!.id);

    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", ownerToken, {
        table_id: tableAId,
        date: dateStr,
        start_time: "17:00",
        guest_name: "Cancel Owner",
        guest_phone: "+10000000006",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);

    const strangerCancelRes = await cancelReservation(
      jsonRequest(`/api/reservations/${reservation.id}/cancel`, "POST", strangerToken),
      { params: Promise.resolve({ id: String(reservation.id) }) }
    );
    expect(strangerCancelRes.status).toBe(404);

    const ownerCancelRes = await cancelReservation(
      jsonRequest(`/api/reservations/${reservation.id}/cancel`, "POST", ownerToken),
      { params: Promise.resolve({ id: String(reservation.id) }) }
    );
    expect(ownerCancelRes.status).toBe(200);
    expect((await ownerCancelRes.json()).status).toBe("cancelled");
  });

  it("a signed-in guest cannot cancel someone else's anonymous reservation", async () => {
    const anonCreateRes = await createReservation(
      jsonRequest("/api/reservations", "POST", null, {
        table_id: tableBId,
        date: dateStr,
        start_time: "08:00",
        guest_name: "Anonymous Owner",
        guest_phone: "+10000000007",
        party_size: 2,
      })
    );
    expect(anonCreateRes.status).toBe(201);
    const reservation = await anonCreateRes.json();
    reservationIds.push(reservation.id);
    expect(reservation.guest_user_id).toBeNull();

    const strangerEmail = `tf-cancel-anon-stranger-${Date.now()}@example.com`;
    const strangerToken = await createGuestToken(strangerEmail);
    guestUserIds.push((await admin.auth.admin.listUsers()).data.users.find((u) => u.email === strangerEmail)!.id);

    // strict `guest_user_id !== user.id` comparison must treat null (anonymous)
    // and a real guest id as never equal - not fall through to "matches".
    const res = await cancelReservation(jsonRequest(`/api/reservations/${reservation.id}/cancel`, "POST", strangerToken), {
      params: Promise.resolve({ id: String(reservation.id) }),
    });
    expect(res.status).toBe(404);
  });

  it("cancelling an already-cancelled reservation is rejected (409)", async () => {
    const guestEmail = `tf-double-cancel-${Date.now()}@example.com`;
    const guestToken = await createGuestToken(guestEmail);
    guestUserIds.push((await admin.auth.admin.listUsers()).data.users.find((u) => u.email === guestEmail)!.id);

    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", guestToken, {
        table_id: tableBId,
        date: dateStr,
        start_time: "09:30",
        guest_name: "Double Cancel",
        guest_phone: "+10000000008",
        party_size: 2,
      })
    );
    expect(createRes.status).toBe(201);
    const reservation = await createRes.json();
    reservationIds.push(reservation.id);

    const firstCancel = await cancelReservation(jsonRequest(`/api/reservations/${reservation.id}/cancel`, "POST", guestToken), {
      params: Promise.resolve({ id: String(reservation.id) }),
    });
    expect(firstCancel.status).toBe(200);

    const secondCancel = await cancelReservation(jsonRequest(`/api/reservations/${reservation.id}/cancel`, "POST", guestToken), {
      params: Promise.resolve({ id: String(reservation.id) }),
    });
    expect(secondCancel.status).toBe(409);
  });

  it("cancel requires authentication", async () => {
    const res = await cancelReservation(jsonRequest("/api/reservations/999999999/cancel", "POST", null), {
      params: Promise.resolve({ id: "999999999" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a booking date beyond the advance-booking window", async () => {
    const res = await createReservation(
      jsonRequest("/api/reservations", "POST", null, {
        table_id: tableAId,
        date: "2099-01-01",
        start_time: "12:00",
        guest_name: "Too Far Ahead",
        guest_phone: "+10000000009",
        party_size: 2,
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.details.date).toBeDefined();
  });
});

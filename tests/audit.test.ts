/** Integration tests for the staff action journal (audit_log, lib/audit.ts,
 * GET /api/audit) against a Supabase TEST project - needs the
 * 20261029120100_audit_log migration applied there. Journal rows are
 * append-only by design, so the ones these tests write stay behind in the
 * test project; everything else is cleaned up. */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listAudit } from "../app/api/audit/route";
import { POST as createReservation } from "../app/api/reservations/route";
import { PATCH as patchReservation } from "../app/api/reservations/[id]/route";
import { POST as createHall } from "../app/api/halls/route";
import { POST as createTable } from "../app/api/tables/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signInStaff(): Promise<{ token: string; userId: string }> {
  const email = process.env.TEST_HOSTESS_EMAIL;
  const password = process.env.TEST_HOSTESS_PASSWORD;
  if (!email || !password) throw new Error("TEST_HOSTESS_EMAIL / TEST_HOSTESS_PASSWORD are not configured (.env.local)");
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("staff sign-in failed");
  return { token: data.session.access_token, userId: data.user.id };
}

function jsonRequest(path: string, method: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("audit log", () => {
  let staffToken: string;
  let staffUserId: string;
  let hallId: number;
  let tableId: number;
  let reservationId: number;

  beforeAll(async () => {
    ({ token: staffToken, userId: staffUserId } = await signInStaff());

    const hallRes = await createHall(jsonRequest("/api/halls", "POST", staffToken, { name: `Audit Hall ${Date.now()}` }));
    expect(hallRes.status).toBe(201);
    hallId = (await hallRes.json()).id;

    const tableRes = await createTable(
      jsonRequest("/api/tables", "POST", staffToken, { hall_id: hallId, label: "A1", min_capacity: 1, max_capacity: 4 })
    );
    expect(tableRes.status).toBe(201);
    tableId = (await tableRes.json()).id;

    const date = new Date();
    date.setDate(date.getDate() + 40);
    const createRes = await createReservation(
      jsonRequest("/api/reservations", "POST", null, {
        table_id: tableId,
        date: date.toISOString().slice(0, 10),
        start_time: "18:00",
        guest_name: "Audit Guest",
        guest_phone: "+79000000101",
        party_size: 2,
        consent_pd: true,
      })
    );
    expect(createRes.status).toBe(201);
    reservationId = (await createRes.json()).id;
  });

  afterAll(async () => {
    if (reservationId) await admin.from("reservations").delete().eq("id", reservationId);
    if (tableId) await admin.from("dining_tables").delete().eq("id", tableId);
    if (hallId) await admin.from("halls").delete().eq("id", hallId);
  });

  it("records table creation with the acting staff member", async () => {
    const { data } = await admin
      .from("audit_log")
      .select("actor_user_id, actor_role, action, details")
      .eq("entity", "table")
      .eq("entity_id", String(tableId));
    expect(data).toEqual([
      { actor_user_id: staffUserId, actor_role: "staff", action: "table.created", details: { hall_id: hallId } },
    ]);
  });

  it("a status change writes a reservation.status_changed entry without guest data", async () => {
    const res = await patchReservation(
      jsonRequest(`/api/reservations/${reservationId}`, "PATCH", staffToken, { status: "confirmed" }),
      { params: Promise.resolve({ id: String(reservationId) }) }
    );
    expect(res.status).toBe(200);

    const { data } = await admin
      .from("audit_log")
      .select("actor_user_id, actor_role, action, details")
      .eq("entity", "reservation")
      .eq("entity_id", String(reservationId));
    expect(data).toEqual([
      {
        actor_user_id: staffUserId,
        actor_role: "staff",
        action: "reservation.status_changed",
        details: { from: "pending", to: "confirmed", by: "host", fields: [] },
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("Audit Guest");
    expect(JSON.stringify(data)).not.toContain("79000000101");
  });

  it("journal rows can't be changed or removed, even with the service key", async () => {
    const { data: row } = await admin
      .from("audit_log")
      .select("id")
      .eq("entity", "table")
      .eq("entity_id", String(tableId))
      .single();

    const { error: updateError } = await admin.from("audit_log").update({ action: "tampered" }).eq("id", row!.id);
    expect(updateError).not.toBeNull();
    const { error: deleteError } = await admin.from("audit_log").delete().eq("id", row!.id);
    expect(deleteError).not.toBeNull();

    const { data: after } = await admin.from("audit_log").select("action").eq("id", row!.id).single();
    expect(after?.action).toBe("table.created");
  });

  it("the anon key can't read the journal", async () => {
    const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await anon.from("audit_log").select("id").limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("GET /api/audit requires a staff token", async () => {
    const res = await listAudit(jsonRequest("/api/audit", "GET", null));
    expect(res.status).toBe(401);
  });

  it("GET /api/audit lists newest first, filters and pages by id", async () => {
    const res = await listAudit(jsonRequest("/api/audit?entity=reservation&limit=1", "GET", staffToken));
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].entity).toBe("reservation");
    expect(page.next_before).toBe(page.items[0].id);

    const next = await listAudit(
      jsonRequest(`/api/audit?entity=reservation&limit=1&before=${page.next_before}`, "GET", staffToken)
    );
    const nextPage = await next.json();
    for (const item of nextPage.items) expect(item.id).toBeLessThan(page.next_before);

    const bad = await listAudit(jsonRequest("/api/audit?limit=500", "GET", staffToken));
    expect(bad.status).toBe(400);
  });
});

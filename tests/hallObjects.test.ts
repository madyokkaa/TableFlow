/** Integration tests for the real-scale floor plan API (hall size/floor,
 * table rotation, hall objects). Like reservations.test.ts they run against
 * a real Supabase project, and need the 20261003120000_real_scale_floor_plans
 * migration applied there. */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createHall } from "../app/api/halls/route";
import { PATCH as patchHall } from "../app/api/halls/[id]/route";
import { POST as createTable } from "../app/api/tables/route";
import { PATCH as patchTable } from "../app/api/tables/[id]/route";
import { GET as listObjects, POST as createObject } from "../app/api/halls/[id]/objects/route";
import { DELETE as deleteObject, PATCH as patchObject } from "../app/api/halls/[id]/objects/[objectId]/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function getStaffToken(): Promise<string> {
  const email = process.env.TEST_HOSTESS_EMAIL;
  const password = process.env.TEST_HOSTESS_PASSWORD;
  if (!email || !password) throw new Error("TEST_HOSTESS_EMAIL / TEST_HOSTESS_PASSWORD are not configured (.env.local)");
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("staff sign-in failed");
  return data.session.access_token;
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

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

describe("real-scale floor plan API", () => {
  let staffToken: string;
  let hallId: number;
  let tableId: number;

  beforeAll(async () => {
    staffToken = await getStaffToken();
    const hallRes = await createHall(
      jsonRequest("/api/halls", "POST", staffToken, { name: `Plan Hall ${Date.now()}`, width_m: 12, length_m: 9, floor: "tile" })
    );
    expect(hallRes.status).toBe(201);
    const hall = await hallRes.json();
    hallId = hall.id;
    expect(hall).toMatchObject({ width_m: 12, length_m: 9, floor: "tile" });

    const tableRes = await createTable(
      jsonRequest("/api/tables", "POST", staffToken, {
        hall_id: hallId,
        label: "P1",
        min_capacity: 2,
        max_capacity: 4,
        pos_x: 200,
        pos_y: 200,
        rotation: 90,
      })
    );
    expect(tableRes.status).toBe(201);
    const table = await tableRes.json();
    tableId = table.id;
    expect(table.rotation).toBe(90);
  }, 30_000);

  afterAll(async () => {
    await admin.from("hall_objects").delete().eq("hall_id", hallId);
    await admin.from("dining_tables").delete().eq("id", tableId);
    await admin.from("halls").delete().eq("id", hallId);
  }, 30_000);

  it("validates and saves hall size and floor", async () => {
    const bad = await patchHall(jsonRequest(`/api/halls/${hallId}`, "PATCH", staffToken, { width_m: 100 }), params({ id: String(hallId) }));
    expect(bad.status).toBe(400);

    const ok = await patchHall(
      jsonRequest(`/api/halls/${hallId}`, "PATCH", staffToken, { width_m: 14, floor: "concrete" }),
      params({ id: String(hallId) })
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ width_m: 14, floor: "concrete" });
  });

  it("rotates a table and rejects a non-quarter turn", async () => {
    const bad = await patchTable(jsonRequest(`/api/tables/${tableId}`, "PATCH", staffToken, { rotation: 45 }), params({ id: String(tableId) }));
    expect(bad.status).toBe(400);

    const ok = await patchTable(jsonRequest(`/api/tables/${tableId}`, "PATCH", staffToken, { rotation: 180 }), params({ id: String(tableId) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).rotation).toBe(180);
  });

  it("requires staff auth to create an object", async () => {
    const res = await createObject(
      jsonRequest(`/api/halls/${hallId}/objects`, "POST", null, { kind: "bar", pos_x: 300, pos_y: 100 }),
      params({ id: String(hallId) })
    );
    expect(res.status).toBe(401);
  });

  it("creates, lists, edits and deletes a hall object", async () => {
    const created = await createObject(
      jsonRequest(`/api/halls/${hallId}/objects`, "POST", staffToken, { kind: "bar", pos_x: 300, pos_y: 100 }),
      params({ id: String(hallId) })
    );
    expect(created.status).toBe(201);
    const object = await created.json();
    expect(object).toMatchObject({ kind: "bar", width: 320, height: 80, rotation: 0, label: "Бар" });

    const list = await listObjects(jsonRequest(`/api/halls/${hallId}/objects`, "GET", null), params({ id: String(hallId) }));
    expect(list.status).toBe(200);
    expect((await list.json()).map((o: { id: number }) => o.id)).toContain(object.id);

    const patched = await patchObject(
      jsonRequest(`/api/halls/${hallId}/objects/${object.id}`, "PATCH", staffToken, { rotation: 90, label: "Барная стойка" }),
      params({ id: String(hallId), objectId: String(object.id) })
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ rotation: 90, label: "Барная стойка" });

    const removed = await deleteObject(
      jsonRequest(`/api/halls/${hallId}/objects/${object.id}`, "DELETE", staffToken),
      params({ id: String(hallId), objectId: String(object.id) })
    );
    expect(removed.status).toBe(204);
  });

  it("rejects an unknown object kind", async () => {
    const res = await createObject(
      jsonRequest(`/api/halls/${hallId}/objects`, "POST", staffToken, { kind: "pool", pos_x: 300, pos_y: 100 }),
      params({ id: String(hallId) })
    );
    expect(res.status).toBe(400);
  });

  it("does not edit an object through another hall's URL", async () => {
    const created = await createObject(
      jsonRequest(`/api/halls/${hallId}/objects`, "POST", staffToken, { kind: "plant", pos_x: 100, pos_y: 100 }),
      params({ id: String(hallId) })
    );
    const object = await created.json();
    const res = await patchObject(
      jsonRequest(`/api/halls/${hallId + 999999}/objects/${object.id}`, "PATCH", staffToken, { rotation: 90 }),
      params({ id: String(hallId + 999999), objectId: String(object.id) })
    );
    expect(res.status).toBe(404);
  });
});

/** Integration tests for guest data erasure (POST /api/privacy/erase,
 * erase_guest_data) against a Supabase TEST project - needs the
 * 20261029120300_erase_guest_data migration applied there. */
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postErase } from "../app/api/privacy/erase/route";
import { POST as createReservation } from "../app/api/reservations/route";
import { PATCH as patchReservation } from "../app/api/reservations/[id]/route";
import { POST as createHall } from "../app/api/halls/route";
import { POST as createTable } from "../app/api/tables/route";
import { RATE_LIMITS, rateLimitKey } from "../lib/rateLimit";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getStaffToken(): Promise<string> {
  const email = process.env.TEST_HOSTESS_EMAIL;
  const password = process.env.TEST_HOSTESS_PASSWORD;
  if (!email || !password) throw new Error("TEST_HOSTESS_EMAIL / TEST_HOSTESS_PASSWORD are not configured (.env.local)");
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("staff sign-in failed");
  return data.session.access_token;
}

function jsonRequest(path: string, method: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { "content-type": "application/json", ...headers };
  if (token) all.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: all,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const erase = (contact: unknown, headers: Record<string, string> = {}) =>
  postErase(jsonRequest("/api/privacy/erase", "POST", null, { contact }, headers));

describe("guest data erasure", () => {
  const stamp = Date.now();
  const email = `tf-erase-${stamp}@example.com`;
  // A unique, complete Russian mobile number for this run.
  const digits = String(stamp).slice(-7);
  const phone = `+7 (955) ${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;

  let staffToken: string;
  let hallId: number;
  let tableId: number;
  let closedId: number;
  let activeId: number;
  let dateStr: string;

  async function book(startTime: string): Promise<number> {
    const res = await createReservation(
      jsonRequest("/api/reservations", "POST", null, {
        table_id: tableId,
        date: dateStr,
        start_time: startTime,
        guest_name: "Erase Me",
        guest_phone: phone,
        guest_email: email,
        party_size: 2,
        consent_pd: true,
      })
    );
    expect(res.status).toBe(201);
    return (await res.json()).id;
  }

  beforeAll(async () => {
    staffToken = await getStaffToken();
    const hallRes = await createHall(jsonRequest("/api/halls", "POST", staffToken, { name: `Erase Hall ${stamp}` }));
    hallId = (await hallRes.json()).id;
    const tableRes = await createTable(
      jsonRequest("/api/tables", "POST", staffToken, { hall_id: hallId, label: "E1", min_capacity: 1, max_capacity: 4 })
    );
    tableId = (await tableRes.json()).id;

    const date = new Date();
    date.setDate(date.getDate() + 30);
    dateStr = date.toISOString().slice(0, 10);

    closedId = await book("12:00");
    const cancelRes = await patchReservation(
      jsonRequest(`/api/reservations/${closedId}`, "PATCH", staffToken, { status: "cancelled" }),
      { params: Promise.resolve({ id: String(closedId) }) }
    );
    expect(cancelRes.status).toBe(200);

    activeId = await book("19:00");
  });

  afterAll(async () => {
    await admin.from("reservations").delete().in("id", [closedId, activeId].filter(Boolean));
    if (tableId) await admin.from("dining_tables").delete().eq("id", tableId);
    if (hallId) await admin.from("halls").delete().eq("id", hallId);
  });

  it("anonymises a closed booking and leaves an upcoming active one alone", async () => {
    const res = await erase(email.toUpperCase());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { data: closed } = await admin
      .from("reservations")
      .select("guest_name, guest_phone, guest_email, guest_user_id, anonymized_at, status, party_size")
      .eq("id", closedId)
      .single();
    expect(closed).toMatchObject({
      guest_name: "Удалено по запросу гостя",
      guest_phone: null,
      guest_email: null,
      guest_user_id: null,
      status: "cancelled",
      party_size: 2,
    });
    expect(closed?.anonymized_at).not.toBeNull();

    const { data: active } = await admin
      .from("reservations")
      .select("guest_name, guest_phone, guest_email, status, anonymized_at")
      .eq("id", activeId)
      .single();
    expect(active).toEqual({ guest_name: "Erase Me", guest_phone: phone, guest_email: email, status: "pending", anonymized_at: null });
  });

  it("is safe to repeat, also with the phone written differently", async () => {
    const again = await erase(email);
    expect(again.status).toBe(200);
    const byPhone = await erase(`8${phone.replace(/\D/g, "").slice(1)}`);
    expect(byPhone.status).toBe(200);

    const { data: active } = await admin.from("reservations").select("guest_name").eq("id", activeId).single();
    expect(active?.guest_name).toBe("Erase Me");
  });

  it("answers the same for a contact that never booked", async () => {
    const known = await (await erase(email)).json();
    const unknown = await (await erase(`tf-never-booked-${stamp}@example.com`)).json();
    expect(unknown).toEqual(known);
  });

  it("journals only the number of rows, never the contact", async () => {
    const { data } = await admin
      .from("audit_log")
      .select("actor_role, actor_user_id, entity_id, details")
      .eq("action", "guest_data.erased")
      .order("id", { ascending: false })
      .limit(5);
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.some((row) => (row.details as { count: number }).count === 1)).toBe(true);
    for (const row of data ?? []) {
      expect(row).toMatchObject({ actor_role: "guest", actor_user_id: null, entity_id: null });
      expect(Object.keys(row.details as object)).toEqual(["count"]);
    }
    expect(JSON.stringify(data)).not.toContain(email);
  });

  it("rejects a malformed contact (400)", async () => {
    for (const contact of ["", "not-an-email", "+7 900", 42]) {
      const res = await erase(contact);
      expect(res.status).toBe(400);
      expect((await res.json()).details.contact).toBeDefined();
    }
  });

  it("is rate-limited per IP (429)", async () => {
    const previous = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const ip = `198.51.100.${(stamp % 250) + 1}`;
    try {
      const statuses: number[] = [];
      for (let i = 0; i <= RATE_LIMITS.privacyErase.limit; i++) {
        statuses.push((await erase(`tf-limit-${stamp}@example.com`, { "x-forwarded-for": ip })).status);
      }
      expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
    } finally {
      if (previous !== undefined) process.env.RATE_LIMIT_DISABLED = previous;
      await admin.from("rate_limits").delete().eq("key", rateLimitKey("privacy.erase", ip));
    }
  });
});

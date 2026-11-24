/** CONCURRENCY (default 1000) simultaneous bookings of one table at one
 * time, against a Supabase TEST project: exactly one must win (201), every
 * other one must get 409 from the EXCLUDE constraint, and the table must
 * end up with exactly one active booking. Heavy, so it only runs on
 * request: `npm run test:concurrency` or RUN_CONCURRENCY=1. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createReservation } from "../app/api/reservations/route";

const enabled = process.env.RUN_CONCURRENCY === "1" || process.env.npm_lifecycle_event === "test:concurrency";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1000);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const production = process.env.PRODUCTION_SUPABASE_URL?.trim();

describe.skipIf(!enabled)(`${CONCURRENCY} concurrent bookings of one table`, () => {
  // Created in beforeAll: a skipped suite still runs this body, and
  // createClient throws without a URL.
  let admin: SupabaseClient;
  const stamp = Date.now();
  let hallId: number;
  let tableId: number;
  let userId: string;
  let token: string;
  let dateStr: string;

  beforeAll(async () => {
    // Never against the restaurant's live database: this fills one table
    // with a thousand attempts and deletes what it made afterwards.
    if (production && production.replace(/\/+$/, "") === url?.replace(/\/+$/, "")) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is the production project (PRODUCTION_SUPABASE_URL) - refusing to run");
    }
    if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 2) throw new Error("CONCURRENCY must be an integer >= 2");
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: hall, error: hallError } = await admin
      .from("halls")
      .insert({ name: `Concurrency Hall ${stamp}` })
      .select("id")
      .single();
    if (hallError) throw hallError;
    hallId = hall.id;

    const { data: table, error: tableError } = await admin
      .from("dining_tables")
      .insert({ hall_id: hallId, label: "C1", min_capacity: 1, max_capacity: 4 })
      .select("id")
      .single();
    if (tableError) throw tableError;
    tableId = table.id;

    const email = `tf-concurrency-${stamp}@example.com`;
    const password = `Concurrency-${stamp}!`;
    const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError || !created.user) throw userError ?? new Error("test user creation failed");
    userId = created.user.id;
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.session) throw signInError ?? new Error("test user sign-in failed");
    token = signIn.session.access_token;

    const date = new Date();
    date.setDate(date.getDate() + 60);
    dateStr = date.toISOString().slice(0, 10);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (tableId) {
      const { data: links } = await admin.from("reservation_tables").select("reservation_id").eq("table_id", tableId);
      const ids = [...new Set((links ?? []).map((l) => l.reservation_id))];
      if (ids.length) await admin.from("reservations").delete().in("id", ids);
      await admin.from("dining_tables").delete().eq("id", tableId);
    }
    if (hallId) await admin.from("halls").delete().eq("id", hallId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }, 60_000);

  it("exactly one succeeds, the rest get 409", async () => {
    const body = JSON.stringify({
      table_id: tableId,
      date: dateStr,
      start_time: "19:00",
      guest_name: "Concurrency",
      guest_phone: "+7 (900) 000-00-00",
      party_size: 2,
      consent_pd: true,
    });
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        createReservation(
          new NextRequest("http://localhost/api/reservations", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body,
          })
        )
      )
    );

    const byStatus = new Map<number, number>();
    for (const res of responses) byStatus.set(res.status, (byStatus.get(res.status) ?? 0) + 1);
    const summary = Object.fromEntries(byStatus);
    expect(summary, `status counts: ${JSON.stringify(summary)}`).toEqual({ 201: 1, 409: CONCURRENCY - 1 });

    const { count, error } = await admin
      .from("reservation_tables")
      .select("id", { count: "exact", head: true })
      .eq("table_id", tableId)
      .in("status", ["pending", "confirmed"]);
    expect(error).toBeNull();
    expect(count).toBe(1);
  }, 300_000);
});

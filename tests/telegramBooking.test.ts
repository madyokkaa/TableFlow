/** The bot's booking store against a Supabase TEST project (needs the
 * 20261030120000_telegram_bot migration): a Telegram booking is created
 * pending with source telegram_ai, and only its own chat can cancel it. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseBookingStore } from "../lib/telegram/store";
import { restaurantClock } from "../lib/ai/clock";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("telegram booking store", () => {
  const stamp = Date.now();
  const chatId = 9_000_000_000 + (stamp % 1_000_000);
  let hallId: number;
  let tableId: number;
  let reservationId: number;
  let date: string;

  beforeAll(async () => {
    const { data: hall } = await admin.from("halls").insert({ name: `Telegram Hall ${stamp}` }).select("id").single();
    hallId = hall!.id;
    // The store picks the smallest table that fits; a party of 77 only
    // fits this one, whatever else the test project holds.
    const { data: table } = await admin
      .from("dining_tables")
      .insert({ hall_id: hallId, label: "TG", min_capacity: 1, max_capacity: 100 })
      .select("id")
      .single();
    tableId = table!.id;
    const d = new Date();
    d.setDate(d.getDate() + 20);
    date = d.toISOString().slice(0, 10);
  });

  afterAll(async () => {
    if (reservationId) await admin.from("reservations").delete().eq("id", reservationId);
    if (tableId) await admin.from("dining_tables").delete().eq("id", tableId);
    if (hallId) await admin.from("halls").delete().eq("id", hallId);
    await admin.from("telegram_sessions").delete().eq("chat_id", chatId);
  });

  it("creates a pending telegram_ai booking with the transcript and chat id", async () => {
    const consentAt = new Date().toISOString();
    const result = await supabaseBookingStore.create({
      chatId,
      date,
      time: "19:00",
      partySize: 77,
      name: "Айгерім",
      phone: "+7 (701) 123-45-67",
      transcript: "ертең кешкі 7-ге 77 адам",
      consentAt,
      aiRequestIds: [],
    });
    expect(result.ok).toBe(true);
    reservationId = (result as { reservationId: number }).reservationId;

    const { data } = await admin
      .from("reservations")
      .select("status, source, ai_transcript, telegram_chat_id, consent_at, guest_phone, reservation_tables(table_id)")
      .eq("id", reservationId)
      .single();
    expect(data).toMatchObject({
      status: "pending",
      source: "telegram_ai",
      ai_transcript: "ертең кешкі 7-ге 77 адам",
      telegram_chat_id: chatId,
      guest_phone: "+7 (701) 123-45-67",
    });
    expect(Date.parse(data!.consent_at)).toBe(Date.parse(consentAt));
    expect(data!.reservation_tables).toEqual([{ table_id: tableId }]);
  });

  it("reports the table as taken for the same time", async () => {
    const again = await supabaseBookingStore.create({
      chatId,
      date,
      time: "19:30",
      partySize: 77,
      name: "Ерлан",
      phone: "+7 (701) 000-00-00",
      transcript: "",
      consentAt: null,
      aiRequestIds: [],
    });
    expect(again).toEqual({ ok: false, reason: "no_table" });
  });

  it("lets only the same chat cancel it", async () => {
    const clock = restaurantClock();
    expect(await supabaseBookingStore.cancel(reservationId, chatId + 1, clock)).toBe("not_allowed");
    expect(await supabaseBookingStore.cancel(reservationId, chatId, clock)).toBe("cancelled");
    const { data } = await admin.from("reservations").select("status, cancelled_by").eq("id", reservationId).single();
    expect(data).toEqual({ status: "cancelled", cancelled_by: "guest" });
  });

  it("claims each webhook update_id once", async () => {
    const updateId = stamp;
    const first = await admin.rpc("telegram_claim_update", { p_update_id: updateId });
    const second = await admin.rpc("telegram_claim_update", { p_update_id: updateId });
    expect([first.data, second.data]).toEqual([true, false]);
  });
});

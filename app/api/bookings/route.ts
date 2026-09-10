import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

type CreateBookingPayload = {
  slot_id?: unknown;
  guest_name?: unknown;
  guest_phone?: unknown;
  guest_email?: unknown;
  party_size?: unknown;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const payload: CreateBookingPayload = await request.json().catch(() => ({}));
  const { slot_id, guest_name, guest_phone, guest_email, party_size } = payload;

  const errors: Record<string, string> = {};

  // Column lengths mirror the migration - varchar(120)/varchar(30)/varchar(255)
  // equivalents enforced there via CHECK constraints.
  if (typeof guest_name !== "string" || !guest_name.trim()) {
    errors.guest_name = "required";
  } else if (guest_name.length > 120) {
    errors.guest_name = "must be at most 120 characters";
  }

  if (guest_phone !== undefined && guest_phone !== null && typeof guest_phone !== "string") {
    errors.guest_phone = "must be a string";
  } else if (typeof guest_phone === "string" && guest_phone.length > 30) {
    errors.guest_phone = "must be at most 30 characters";
  }

  if (guest_email !== undefined && guest_email !== null && typeof guest_email !== "string") {
    errors.guest_email = "must be a string";
  } else if (typeof guest_email === "string" && guest_email.length > 255) {
    errors.guest_email = "must be at most 255 characters";
  }

  if (!guest_phone && !guest_email && !errors.guest_phone && !errors.guest_email) {
    errors.guest_phone = "guest_phone or guest_email is required";
  }

  if (typeof party_size !== "number" || !Number.isInteger(party_size) || party_size < 1 || party_size > 100) {
    errors.party_size = "must be a positive integer (max 100)";
  }

  if (typeof slot_id !== "number" || !Number.isInteger(slot_id)) {
    errors.slot_id = "required";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: slot, error: slotError } = await supabase
    .from("slots")
    .select("id, date, restaurant_tables(capacity)")
    .eq("id", slot_id as number)
    .maybeSingle<{ id: number; date: string; restaurant_tables: { capacity: number } | null }>();

  if (slotError) {
    console.error("[bookings.create] slot lookup failed", slotError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!slot) {
    return NextResponse.json({ error: `slot ${slot_id} not found` }, { status: 404 });
  }
  if (slot.date < todayIsoDate()) {
    return NextResponse.json(
      { error: "validation_failed", details: { slot_id: "cannot book a slot in the past" } },
      { status: 400 }
    );
  }
  const capacity = slot.restaurant_tables?.capacity ?? 0;
  if ((party_size as number) > capacity) {
    return NextResponse.json(
      { error: "validation_failed", details: { party_size: `exceeds table capacity (${capacity})` } },
      { status: 400 }
    );
  }

  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      slot_id: slot_id as number,
      guest_user_id: user.id,
      guest_name: (guest_name as string).trim(),
      guest_phone: (guest_phone as string | undefined) ?? null,
      guest_email: (guest_email as string | undefined) ?? null,
      party_size: party_size as number,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    // 23505 = unique_violation - the uq_active_booking_per_slot index fired,
    // meaning someone else's request for this slot committed first. This is
    // the DB-level double-booking guard doing its job, not a bug.
    if (insertError.code === "23505") {
      return NextResponse.json({ error: `slot ${slot_id} was just booked by someone else` }, { status: 409 });
    }
    console.error("[bookings.create] insert failed", insertError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { error: logError } = await supabase.from("booking_status_logs").insert({
    booking_id: booking.id,
    from_status: null,
    to_status: "pending",
    changed_by: user.id,
  });
  if (logError) {
    console.error("[bookings.create] status log insert failed", logError);
  }

  return NextResponse.json(booking, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { ALLOWED_STATUS_TRANSITIONS, RESERVATION_STATUSES, type ReservationStatus, mapRpcError } from "@/lib/reservations";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId)) {
    return NextResponse.json({ error: "invalid reservation id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const {
    date,
    start_time,
    duration_minutes,
    party_size,
    guest_name,
    guest_phone,
    guest_email,
    status,
    table_ids,
  } = payload as Record<string, unknown>;

  const supabase = createAdminClient();

  const { data: current, error: currentError } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .maybeSingle();
  if (currentError) {
    console.error("[reservations.update] lookup failed", currentError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: `reservation ${reservationId} not found` }, { status: 404 });
  }

  const errors: Record<string, string> = {};

  if (date !== undefined) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "must be YYYY-MM-DD";
    else if (date < todayIsoDate()) errors.date = "cannot move a reservation into the past";
  }
  if (start_time !== undefined && (typeof start_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time))) {
    errors.start_time = "must be HH:MM";
  }
  if (
    duration_minutes !== undefined &&
    (typeof duration_minutes !== "number" ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes <= 0 ||
      duration_minutes > 480)
  ) {
    errors.duration_minutes = "must be a positive integer no greater than 480 (8 hours)";
  }
  if (party_size !== undefined) {
    if (typeof party_size !== "number" || !Number.isInteger(party_size) || party_size < 1 || party_size > 100) {
      errors.party_size = "must be a positive integer (max 100)";
    }
  }
  if (guest_name !== undefined) {
    if (typeof guest_name !== "string" || !guest_name.trim()) errors.guest_name = "required";
    else if (guest_name.length > 120) errors.guest_name = "must be at most 120 characters";
  }
  if (guest_phone !== undefined && guest_phone !== null && typeof guest_phone !== "string") {
    errors.guest_phone = "must be a string";
  }
  if (guest_email !== undefined && guest_email !== null && typeof guest_email !== "string") {
    errors.guest_email = "must be a string";
  }

  let nextStatus: ReservationStatus | undefined;
  if (status !== undefined) {
    if (typeof status !== "string" || !(RESERVATION_STATUSES as readonly string[]).includes(status)) {
      errors.status = `must be one of ${RESERVATION_STATUSES.join(", ")}`;
    } else {
      nextStatus = status as ReservationStatus;
      // A no-op ("keep the current status") is always fine - it's every
      // other field-only edit going through this same endpoint. Only an
      // actual transition needs to be in the allowed set.
      if (nextStatus !== current.status) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[current.status as ReservationStatus] ?? [];
        if (!allowed.includes(nextStatus)) {
          errors.status = `cannot move a reservation from '${current.status}' to '${nextStatus}'`;
        }
      }
    }
  }

  let tableIds: number[] | undefined;
  if (table_ids !== undefined) {
    if (!Array.isArray(table_ids) || table_ids.length === 0 || !table_ids.every((t) => Number.isInteger(t))) {
      errors.table_ids = "must be a non-empty array of table ids";
    } else {
      tableIds = table_ids as number[];
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  if (tableIds) {
    const { data: tables, error: tablesError } = await supabase
      .from("dining_tables")
      .select("id, hall_id, is_active, manual_status")
      .in("id", tableIds);
    if (tablesError) {
      console.error("[reservations.update] table lookup failed", tablesError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (!tables || tables.length !== tableIds.length) {
      return NextResponse.json({ error: "validation_failed", details: { table_ids: "one or more tables not found" } }, { status: 400 });
    }
    const hallIds = new Set(tables.map((t) => t.hall_id));
    if (hallIds.size > 1) {
      return NextResponse.json(
        { error: "validation_failed", details: { table_ids: "combined tables must be in the same hall" } },
        { status: 400 }
      );
    }
  }

  const { error: rpcError } = await supabase.rpc("update_reservation", {
    p_reservation_id: reservationId,
    p_date: (date as string | undefined) ?? null,
    p_start_time: (start_time as string | undefined) ?? null,
    p_duration_minutes: (duration_minutes as number | undefined) ?? null,
    p_party_size: (party_size as number | undefined) ?? null,
    p_guest_name: (guest_name as string | undefined)?.trim() ?? null,
    p_guest_phone: guest_phone === undefined ? null : (guest_phone as string | null),
    p_guest_email: guest_email === undefined ? null : (guest_email as string | null),
    p_status: nextStatus ?? null,
    p_table_ids: tableIds ?? null,
    // Distinguishes "omitted, leave unchanged" from "explicitly cleared" -
    // both collapse to the same null over the wire otherwise, which meant a
    // hostess clearing a guest's phone/email silently kept the old value.
    p_guest_phone_provided: guest_phone !== undefined,
    p_guest_email_provided: guest_email !== undefined,
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const { data: updated, error: fetchError } = await supabase
    .from("reservations")
    .select("*, reservation_tables(table_id, dining_tables(id, label, hall_id, halls(id, name)))")
    .eq("id", reservationId)
    .single();
  if (fetchError) {
    console.error("[reservations.update] fetch-after-update failed", fetchError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(updated);
}

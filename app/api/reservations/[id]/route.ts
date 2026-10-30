import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, isActiveStaff } from "@/lib/supabase/auth";
import { changedFields, logAudit, valueChanges } from "@/lib/audit";
import { notifyGuestOfStaffChange, supabaseNotifyDeps } from "@/lib/telegram/notify";
import { ALLOWED_STATUS_TRANSITIONS, RESERVATION_STATUSES, STATUS_LABELS_RU, type ReservationStatus, mapRpcError } from "@/lib/reservations";

// Field names (never values) go into the audit log.
const EDITABLE_FIELDS = [
  "date",
  "start_time",
  "duration_minutes",
  "party_size",
  "guest_name",
  "guest_phone",
  "guest_email",
  "table_ids",
  "cancellation_reason",
] as const;
// Of those, the ones without personal data - their values are journalled
// too (before → after). Name, phone, email and the reason stay names only.
const VALUE_FIELDS = ["date", "start_time", "duration_minutes", "party_size", "table_ids"] as const;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Verified locally; the staff lookup itself runs alongside the booking
  // lookup below, saving a round trip to the database.
  const staff = await getAuthenticatedUser(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId)) {
    return NextResponse.json({ error: "некорректный ID брони" }, { status: 400 });
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
    cancellation_reason,
  } = payload as Record<string, unknown>;

  const supabase = createAdminClient();

  const [isStaff, { data: current, error: currentError }] = await Promise.all([
    isActiveStaff(staff.id),
    supabase
      .from("reservations")
      .select(
        "id, status, date, start_time, duration_minutes, party_size, guest_name, guest_phone, guest_email, cancellation_reason, reservation_tables(table_id)"
      )
      .eq("id", reservationId)
      .maybeSingle(),
  ]);
  if (!isStaff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }
  if (currentError) {
    console.error("[reservations.update] lookup failed", currentError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: `бронь ${reservationId} не найдена` }, { status: 404 });
  }

  const errors: Record<string, string> = {};

  if (date !== undefined) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "формат даты: ГГГГ-ММ-ДД";
    else if (date < todayIsoDate()) errors.date = "нельзя перенести бронь в прошлое";
  }
  if (start_time !== undefined && (typeof start_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time))) {
    errors.start_time = "формат времени: ЧЧ:ММ";
  }
  if (
    duration_minutes !== undefined &&
    (typeof duration_minutes !== "number" ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes <= 0 ||
      duration_minutes > 480)
  ) {
    errors.duration_minutes = "должно быть положительным целым числом, не более 480 (8 часов)";
  }
  if (party_size !== undefined) {
    if (typeof party_size !== "number" || !Number.isInteger(party_size) || party_size < 1 || party_size > 100) {
      errors.party_size = "должно быть положительным целым числом (не более 100)";
    }
  }
  if (guest_name !== undefined) {
    if (typeof guest_name !== "string" || !guest_name.trim()) errors.guest_name = "обязательное поле";
    else if (guest_name.length > 120) errors.guest_name = "не более 120 символов";
  }
  if (guest_phone !== undefined && guest_phone !== null && typeof guest_phone !== "string") {
    errors.guest_phone = "должно быть строкой";
  }
  if (guest_email !== undefined && guest_email !== null && typeof guest_email !== "string") {
    errors.guest_email = "должно быть строкой";
  }
  if (cancellation_reason !== undefined && cancellation_reason !== null && typeof cancellation_reason !== "string") {
    errors.cancellation_reason = "должно быть строкой";
  } else if (typeof cancellation_reason === "string" && cancellation_reason.length > 500) {
    errors.cancellation_reason = "не более 500 символов";
  }

  let nextStatus: ReservationStatus | undefined;
  if (status !== undefined) {
    if (typeof status !== "string" || !(RESERVATION_STATUSES as readonly string[]).includes(status)) {
      errors.status = `должно быть одним из: ${RESERVATION_STATUSES.map((s) => STATUS_LABELS_RU[s]).join(", ")}`;
    } else {
      nextStatus = status as ReservationStatus;
      // A no-op ("keep the current status") is always fine - it's every
      // other field-only edit going through this same endpoint. Only an
      // actual transition needs to be in the allowed set.
      if (nextStatus !== current.status) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[current.status as ReservationStatus] ?? [];
        if (!allowed.includes(nextStatus)) {
          errors.status = `нельзя перевести бронь из статуса «${STATUS_LABELS_RU[current.status as ReservationStatus]}» в «${STATUS_LABELS_RU[nextStatus]}»`;
        }
      }
    }
  }

  let tableIds: number[] | undefined;
  if (table_ids !== undefined) {
    if (!Array.isArray(table_ids) || table_ids.length === 0 || !table_ids.every((t) => Number.isInteger(t))) {
      errors.table_ids = "укажите хотя бы один стол";
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
      return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
    }
    if (!tables || tables.length !== tableIds.length) {
      return NextResponse.json(
        { error: "validation_failed", details: { table_ids: "один или несколько столов не найдены" } },
        { status: 400 }
      );
    }
    const hallIds = new Set(tables.map((t) => t.hall_id));
    if (hallIds.size > 1) {
      return NextResponse.json(
        { error: "validation_failed", details: { table_ids: "объединяемые столы должны быть в одном зале" } },
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

  const statusChanged = nextStatus !== undefined && nextStatus !== current.status;
  const before = { ...current, table_ids: current.reservation_tables.map((rt: { table_id: number }) => rt.table_id) };
  const fields = changedFields(payload as Record<string, unknown>, before, EDITABLE_FIELDS);
  const changes = valueChanges(payload as Record<string, unknown>, before, VALUE_FIELDS);

  // The journal entry and the read-back of the saved booking don't depend
  // on each other - written and read at the same time.
  const [, { data: updated, error: fetchError }] = await Promise.all([
    logAudit(supabase, {
      actor: staff.id,
      role: "staff",
      action: !statusChanged
        ? "reservation.updated"
        : nextStatus === "cancelled"
          ? "reservation.cancelled"
          : "reservation.status_changed",
      entity: "reservation",
      entityId: reservationId,
      details: statusChanged ? { from: current.status, to: nextStatus, by: "host", fields, changes } : { fields, changes },
    }),
    (async () => {
      // Cancellation metadata isn't part of the RPC's state machine - a
      // plain follow-up write, only when this call actually cancelled the
      // booking; it must land before the read-back.
      if (nextStatus === "cancelled") {
        const { error: reasonError } = await supabase
          .from("reservations")
          .update({ cancellation_reason: (cancellation_reason as string | undefined)?.trim() || null, cancelled_by: "host" })
          .eq("id", reservationId);
        if (reasonError) {
          console.error("[reservations.update] saving cancellation reason failed", reasonError);
        }
      }
      return supabase
        .from("reservations")
        .select("*, reservation_tables(table_id, dining_tables(id, label, hall_id, halls(id, name)))")
        .eq("id", reservationId)
        .single();
    })(),
  ]);
  if (fetchError) {
    console.error("[reservations.update] fetch-after-update failed", fetchError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  // Bookings from the Telegram bot: tell the guest. Never fails the edit.
  if (updated.telegram_chat_id) {
    await notifyGuestOfStaffChange(
      { status: current.status, date: current.date, start_time: current.start_time },
      {
        id: updated.id,
        status: updated.status,
        date: updated.date,
        start_time: updated.start_time,
        telegram_chat_id: updated.telegram_chat_id,
        cancellation_reason: updated.cancellation_reason,
        hallName: updated.reservation_tables?.[0]?.dining_tables?.halls?.name ?? null,
      },
      supabaseNotifyDeps(supabase)
    );
  }

  return NextResponse.json(updated);
}

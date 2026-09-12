import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { ALLOWED_STATUS_TRANSITIONS, mapRpcError, type ReservationStatus } from "@/lib/reservations";
import { restaurantTodayIso } from "@/lib/scheduling";

// Guest self-service: cancel one's own reservation. Deliberately a separate,
// narrow endpoint from the staff PATCH route rather than reusing it with a
// role check bolted on - this one can only ever set status to "cancelled"
// and only on a reservation the caller owns.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId)) {
    return NextResponse.json({ error: "некорректный ID брони" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: reservation, error: lookupError } = await admin
    .from("reservations")
    .select("id, guest_user_id, status, date")
    .eq("id", reservationId)
    .maybeSingle();
  if (lookupError) {
    console.error("[reservations.cancel] lookup failed", lookupError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  // Same response whether the reservation doesn't exist or belongs to
  // someone else - doesn't confirm or deny which ids exist to a caller
  // probing them.
  if (!reservation || reservation.guest_user_id !== user.id) {
    return NextResponse.json({ error: `бронь ${reservationId} не найдена` }, { status: 404 });
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[reservation.status as ReservationStatus] ?? [];
  if (!allowed.includes("cancelled")) {
    return NextResponse.json({ error: "эту бронь уже нельзя отменить" }, { status: 409 });
  }
  // The dashboard only shows a Cancel button for today-or-later reservations
  // - enforce that server-side too, not just as a UI affordance, so a
  // direct call can't cancel a reservation retroactively (which would
  // erase the hostess's ability to mark it no-show).
  if (reservation.date < restaurantTodayIso()) {
    return NextResponse.json({ error: "эту бронь уже нельзя отменить" }, { status: 409 });
  }

  // The DB's own status-transition trigger (see the 20260912090000
  // migration) enforces the same rule independently of this check - the
  // same defense-in-depth every other write in this app relies on.
  const { error: rpcError } = await admin.rpc("update_reservation", {
    p_reservation_id: reservationId,
    p_status: "cancelled",
  });
  if (rpcError) {
    const mapped = mapRpcError(rpcError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  return NextResponse.json({ id: reservationId, status: "cancelled" });
}

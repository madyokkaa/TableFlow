import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

const VALID_STATUSES = ["pending", "confirmed", "cancelled", "no-show"] as const;
type Status = (typeof VALID_STATUSES)[number];

// Terminal states (cancelled/no-show) have no outgoing transitions.
const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no-show"],
  cancelled: [],
  "no-show": [],
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) {
    return NextResponse.json({ error: "invalid booking id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const newStatus = (payload as { status?: unknown })?.status;
  if (typeof newStatus !== "string" || !(VALID_STATUSES as readonly string[]).includes(newStatus)) {
    return NextResponse.json(
      { error: "validation_failed", details: { status: `must be one of ${VALID_STATUSES.join(", ")}` } },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .maybeSingle<{ id: number; status: Status }>();

  if (fetchError) {
    console.error("[bookings.patch] lookup failed", fetchError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: `booking ${bookingId} not found` }, { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(newStatus as Status)) {
    return NextResponse.json(
      { error: `cannot move booking ${bookingId} from '${booking.status}' to '${newStatus}'` },
      { status: 409 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", bookingId)
    .select()
    .single();

  if (updateError) {
    console.error("[bookings.patch] update failed", updateError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { error: logError } = await supabase.from("booking_status_logs").insert({
    booking_id: bookingId,
    from_status: booking.status,
    to_status: newStatus,
    changed_by: staff.id,
  });
  if (logError) {
    console.error("[bookings.patch] status log insert failed", logError);
  }

  return NextResponse.json(updated);
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

const SHAPES = ["rectangle", "round", "square"] as const;
const MANUAL_STATUSES = ["occupied", "out_of_service"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId)) {
    return NextResponse.json({ error: "invalid table id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const { label, shape, min_capacity, max_capacity, pos_x, pos_y, is_active, manual_status, hall_id } =
    payload as Record<string, unknown>;

  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};

  if (label !== undefined) {
    if (typeof label !== "string" || !label.trim()) errors.label = "required";
    else if (label.trim().length > 40) errors.label = "must be at most 40 characters";
    else update.label = label.trim();
  }
  if (shape !== undefined) {
    if (typeof shape !== "string" || !SHAPES.includes(shape as (typeof SHAPES)[number])) {
      errors.shape = `must be one of ${SHAPES.join(", ")}`;
    } else update.shape = shape;
  }
  if (min_capacity !== undefined) {
    if (typeof min_capacity !== "number" || !Number.isInteger(min_capacity) || min_capacity < 1) {
      errors.min_capacity = "must be a positive integer";
    } else update.min_capacity = min_capacity;
  }
  if (max_capacity !== undefined) {
    if (typeof max_capacity !== "number" || !Number.isInteger(max_capacity)) {
      errors.max_capacity = "must be an integer";
    } else update.max_capacity = max_capacity;
  }
  if (
    typeof update.min_capacity === "number" &&
    typeof update.max_capacity === "number" &&
    update.max_capacity < update.min_capacity
  ) {
    errors.max_capacity = "must be >= min_capacity";
  }
  if (pos_x !== undefined) {
    if (typeof pos_x !== "number") errors.pos_x = "must be a number";
    else update.pos_x = pos_x;
  }
  if (pos_y !== undefined) {
    if (typeof pos_y !== "number") errors.pos_y = "must be a number";
    else update.pos_y = pos_y;
  }
  if (is_active !== undefined) {
    if (typeof is_active !== "boolean") errors.is_active = "must be a boolean";
    else update.is_active = is_active;
  }
  if (manual_status !== undefined) {
    if (manual_status !== null && !MANUAL_STATUSES.includes(manual_status as (typeof MANUAL_STATUSES)[number])) {
      errors.manual_status = `must be null or one of ${MANUAL_STATUSES.join(", ")}`;
    } else update.manual_status = manual_status;
  }
  if (hall_id !== undefined) {
    if (typeof hall_id !== "number" || !Number.isInteger(hall_id)) errors.hall_id = "must be an integer";
    else update.hall_id = hall_id;
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("dining_tables").update(update).eq("id", tableId).select().maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "validation_failed", details: { label: "a table with this label already exists in this hall" } },
        { status: 409 }
      );
    }
    if (error.code === "23514") {
      // Constraint name/message would leak internal column/table names -
      // the only checks on this table are the min/max capacity ordering.
      return NextResponse.json(
        { error: "validation_failed", details: { max_capacity: "must be >= min_capacity" } },
        { status: 400 }
      );
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "validation_failed", details: { hall_id: "hall not found" } }, { status: 400 });
    }
    console.error("[tables.update] update failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: `table ${tableId} not found` }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId)) {
    return NextResponse.json({ error: "invalid table id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { count: activeCount, error: activeError } = await supabase
    .from("reservation_tables")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .in("status", ["pending", "confirmed"]);
  if (activeError) {
    console.error("[tables.delete] active reservation check failed", activeError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if ((activeCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `this table has ${activeCount} active reservation(s) - cancel or move them first` },
      { status: 409 }
    );
  }

  const { error, count: deletedCount } = await supabase.from("dining_tables").delete({ count: "exact" }).eq("id", tableId);
  if (error) {
    // FK restrict (23503) means the table still has historical (completed
    // /cancelled/no-show) reservations - preserving that history matters
    // more than allowing a hard delete, so point staff at the inactive
    // toggle instead of silently losing data.
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "this table has reservation history and can't be deleted - mark it inactive instead" },
        { status: 409 }
      );
    }
    console.error("[tables.delete] delete failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!deletedCount) {
    return NextResponse.json({ error: `table ${tableId} not found` }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

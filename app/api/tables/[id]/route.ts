import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

const SHAPES = ["rectangle", "round", "square"] as const;
const MANUAL_STATUSES = ["occupied", "out_of_service"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId)) {
    return NextResponse.json({ error: "некорректный ID стола" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const { label, shape, min_capacity, max_capacity, pos_x, pos_y, is_active, manual_status, hall_id } =
    payload as Record<string, unknown>;

  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};

  if (label !== undefined) {
    if (typeof label !== "string" || !label.trim()) errors.label = "обязательное поле";
    else if (label.trim().length > 40) errors.label = "не более 40 символов";
    else update.label = label.trim();
  }
  if (shape !== undefined) {
    if (typeof shape !== "string" || !SHAPES.includes(shape as (typeof SHAPES)[number])) {
      errors.shape = `должно быть одним из: ${SHAPES.join(", ")}`;
    } else update.shape = shape;
  }
  if (min_capacity !== undefined) {
    if (typeof min_capacity !== "number" || !Number.isInteger(min_capacity) || min_capacity < 1) {
      errors.min_capacity = "должно быть положительным целым числом";
    } else update.min_capacity = min_capacity;
  }
  if (max_capacity !== undefined) {
    if (typeof max_capacity !== "number" || !Number.isInteger(max_capacity)) {
      errors.max_capacity = "должно быть целым числом";
    } else update.max_capacity = max_capacity;
  }
  if (
    typeof update.min_capacity === "number" &&
    typeof update.max_capacity === "number" &&
    update.max_capacity < update.min_capacity
  ) {
    errors.max_capacity = "должно быть ≥ минимальной вместимости";
  }
  if (pos_x !== undefined) {
    if (typeof pos_x !== "number") errors.pos_x = "должно быть числом";
    else update.pos_x = pos_x;
  }
  if (pos_y !== undefined) {
    if (typeof pos_y !== "number") errors.pos_y = "должно быть числом";
    else update.pos_y = pos_y;
  }
  if (is_active !== undefined) {
    if (typeof is_active !== "boolean") errors.is_active = "должно быть true или false";
    else update.is_active = is_active;
  }
  if (manual_status !== undefined) {
    if (manual_status !== null && !MANUAL_STATUSES.includes(manual_status as (typeof MANUAL_STATUSES)[number])) {
      errors.manual_status = `должно быть null или одним из: ${MANUAL_STATUSES.join(", ")}`;
    } else update.manual_status = manual_status;
  }
  if (hall_id !== undefined) {
    if (typeof hall_id !== "number" || !Number.isInteger(hall_id)) errors.hall_id = "должно быть целым числом";
    else update.hall_id = hall_id;
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "нет полей для обновления" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("dining_tables").update(update).eq("id", tableId).select().maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "validation_failed", details: { label: "стол с таким номером уже есть в этом зале" } },
        { status: 409 }
      );
    }
    if (error.code === "23514") {
      // Constraint name/message would leak internal column/table names -
      // the only checks on this table are the min/max capacity ordering.
      return NextResponse.json(
        { error: "validation_failed", details: { max_capacity: "должно быть ≥ минимальной вместимости" } },
        { status: 400 }
      );
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "validation_failed", details: { hall_id: "зал не найден" } }, { status: 400 });
    }
    console.error("[tables.update] update failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: `стол ${tableId} не найден` }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId)) {
    return NextResponse.json({ error: "некорректный ID стола" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { count: activeCount, error: activeError } = await supabase
    .from("reservation_tables")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .in("status", ["pending", "confirmed"]);
  if (activeError) {
    console.error("[tables.delete] active reservation check failed", activeError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if ((activeCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `у этого стола ${activeCount} активных бронь(ей) - сначала отмените или перенесите их` },
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
        { error: "у этого стола есть история броней - его нельзя удалить, отметьте как недоступный" },
        { status: 409 }
      );
    }
    console.error("[tables.delete] delete failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!deletedCount) {
    return NextResponse.json({ error: `стол ${tableId} не найден` }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

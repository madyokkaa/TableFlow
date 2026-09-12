import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

const SHAPES = ["rectangle", "round", "square"] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");

  const supabase = createAdminClient();
  let query = supabase.from("dining_tables").select("*").order("label");
  if (hallId) {
    const parsed = Number(hallId);
    if (!Number.isInteger(parsed)) {
      return NextResponse.json({ error: "hall_id должен быть целым числом" }, { status: 400 });
    }
    query = query.eq("hall_id", parsed);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[tables.list] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const { hall_id, label, shape, min_capacity, max_capacity, pos_x, pos_y } = payload as Record<string, unknown>;

  const errors: Record<string, string> = {};
  if (typeof hall_id !== "number" || !Number.isInteger(hall_id)) errors.hall_id = "обязательное поле";
  if (typeof label !== "string" || !label.trim()) errors.label = "обязательное поле";
  else if (label.trim().length > 40) errors.label = "не более 40 символов";
  const resolvedShape = shape === undefined ? "rectangle" : shape;
  if (typeof resolvedShape !== "string" || !SHAPES.includes(resolvedShape as (typeof SHAPES)[number])) {
    errors.shape = `должно быть одним из: ${SHAPES.join(", ")}`;
  }
  if (typeof min_capacity !== "number" || !Number.isInteger(min_capacity) || min_capacity < 1) {
    errors.min_capacity = "должно быть положительным целым числом";
  }
  if (
    typeof max_capacity !== "number" ||
    !Number.isInteger(max_capacity) ||
    (typeof min_capacity === "number" && max_capacity < min_capacity)
  ) {
    errors.max_capacity = "должно быть целым числом ≥ минимальной вместимости";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: hall, error: hallError } = await supabase
    .from("halls")
    .select("id")
    .eq("id", hall_id as number)
    .maybeSingle();
  if (hallError) {
    console.error("[tables.create] hall lookup failed", hallError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!hall) {
    return NextResponse.json({ error: `зал ${hall_id} не найден` }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("dining_tables")
    .insert({
      hall_id: hall_id as number,
      label: (label as string).trim(),
      shape: resolvedShape,
      min_capacity,
      max_capacity,
      pos_x: typeof pos_x === "number" ? pos_x : undefined,
      pos_y: typeof pos_y === "number" ? pos_y : undefined,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "validation_failed", details: { label: "стол с таким номером уже есть в этом зале" } },
        { status: 409 }
      );
    }
    console.error("[tables.create] insert failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

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
      return NextResponse.json({ error: "hall_id must be an integer" }, { status: 400 });
    }
    query = query.eq("hall_id", parsed);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[tables.list] query failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const { hall_id, label, shape, min_capacity, max_capacity, pos_x, pos_y } = payload as Record<string, unknown>;

  const errors: Record<string, string> = {};
  if (typeof hall_id !== "number" || !Number.isInteger(hall_id)) errors.hall_id = "required";
  if (typeof label !== "string" || !label.trim()) errors.label = "required";
  else if (label.trim().length > 40) errors.label = "must be at most 40 characters";
  const resolvedShape = shape === undefined ? "rectangle" : shape;
  if (typeof resolvedShape !== "string" || !SHAPES.includes(resolvedShape as (typeof SHAPES)[number])) {
    errors.shape = `must be one of ${SHAPES.join(", ")}`;
  }
  if (typeof min_capacity !== "number" || !Number.isInteger(min_capacity) || min_capacity < 1) {
    errors.min_capacity = "must be a positive integer";
  }
  if (
    typeof max_capacity !== "number" ||
    !Number.isInteger(max_capacity) ||
    (typeof min_capacity === "number" && max_capacity < min_capacity)
  ) {
    errors.max_capacity = "must be an integer >= min_capacity";
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
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!hall) {
    return NextResponse.json({ error: `hall ${hall_id} not found` }, { status: 404 });
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
        { error: "validation_failed", details: { label: "a table with this label already exists in this hall" } },
        { status: 409 }
      );
    }
    console.error("[tables.create] insert failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

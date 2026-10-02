import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { parseHallObjectFields } from "@/lib/floorPlan";
import { MIGRATION_PENDING_MESSAGE, isMissingSchemaError } from "@/lib/schemaErrors";

function parseHallId(id: string): number | null {
  const hallId = Number(id);
  return Number.isInteger(hallId) ? hallId : null;
}

// Public: the non-table objects on a hall's plan (bar, entrance, walls…).
// Readable by anyone, like halls and tables, so the guest plan can show
// them. Before the real-scale migration is applied there's no such table
// yet - that's an empty plan, not an error.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const hallId = parseHallId(id);
  if (hallId === null) {
    return NextResponse.json({ error: "некорректный ID зала" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("hall_objects").select("*").eq("hall_id", hallId).order("id");
  if (error) {
    if (isMissingSchemaError(error)) return NextResponse.json([]);
    console.error("[hall_objects.list] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  return NextResponse.json(data);
}

// Staff-only: place a new object on the plan.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const hallId = parseHallId(id);
  if (hallId === null) {
    return NextResponse.json({ error: "некорректный ID зала" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const { values, errors } = parseHallObjectFields(payload as Record<string, unknown>, true);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hall_objects")
    .insert({ ...values, hall_id: hallId })
    .select()
    .single();

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 409 });
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: `зал ${hallId} не найден` }, { status: 404 });
    }
    console.error("[hall_objects.create] insert failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

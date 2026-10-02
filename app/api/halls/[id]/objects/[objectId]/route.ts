import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { parseHallObjectFields } from "@/lib/floorPlan";
import { MIGRATION_PENDING_MESSAGE, isMissingSchemaError } from "@/lib/schemaErrors";

type Params = { params: Promise<{ id: string; objectId: string }> };

async function parseIds(context: Params): Promise<{ hallId: number; objectId: number } | null> {
  const { id, objectId } = await context.params;
  const hallId = Number(id);
  const objId = Number(objectId);
  if (!Number.isInteger(hallId) || !Number.isInteger(objId)) return null;
  return { hallId, objectId: objId };
}

// Staff-only: move/resize/rotate/relabel an object. Scoped by hall too, so
// an id from another hall's plan can't be edited through this one.
export async function PATCH(request: NextRequest, context: Params) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const ids = await parseIds(context);
  if (!ids) {
    return NextResponse.json({ error: "некорректный ID зала или объекта" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const { values, errors } = parseHallObjectFields(payload as Record<string, unknown>, false);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "нет полей для обновления" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("hall_objects")
    .update(values)
    .eq("id", ids.objectId)
    .eq("hall_id", ids.hallId)
    .select()
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 409 });
    }
    console.error("[hall_objects.update] update failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: `объект ${ids.objectId} не найден` }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: Params) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const ids = await parseIds(context);
  if (!ids) {
    return NextResponse.json({ error: "некорректный ID зала или объекта" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .from("hall_objects")
    .delete({ count: "exact" })
    .eq("id", ids.objectId)
    .eq("hall_id", ids.hallId);

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 409 });
    }
    console.error("[hall_objects.delete] delete failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: `объект ${ids.objectId} не найден` }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

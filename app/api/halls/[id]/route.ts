import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const hallId = Number(id);
  if (!Number.isInteger(hallId)) {
    return NextResponse.json({ error: "invalid hall id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const { name, description } = payload as { name?: unknown; description?: unknown };

  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) errors.name = "required";
    else if (name.trim().length > 120) errors.name = "must be at most 120 characters";
    else update.name = name.trim();
  }
  if (description !== undefined) {
    if (description !== null && typeof description !== "string") errors.description = "must be a string";
    else if (typeof description === "string" && description.length > 2000) errors.description = "must be at most 2000 characters";
    else update.description = (description as string | null)?.trim() || null;
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("halls").update(update).eq("id", hallId).select().maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "validation_failed", details: { name: "a hall with this name already exists" } },
        { status: 409 }
      );
    }
    console.error("[halls.update] update failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: `hall ${hallId} not found` }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const hallId = Number(id);
  if (!Number.isInteger(hallId)) {
    return NextResponse.json({ error: "invalid hall id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { count, error: countError } = await supabase
    .from("dining_tables")
    .select("id", { count: "exact", head: true })
    .eq("hall_id", hallId);
  if (countError) {
    console.error("[halls.delete] table count failed", countError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `this hall has ${count} table(s) - remove or move them first` },
      { status: 409 }
    );
  }

  const { error, count: deletedCount } = await supabase.from("halls").delete({ count: "exact" }).eq("id", hallId);
  if (error) {
    console.error("[halls.delete] delete failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!deletedCount) {
    return NextResponse.json({ error: `hall ${hallId} not found` }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("halls").select("*").order("name");
  if (error) {
    console.error("[halls.list] query failed", error);
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
  const { name, description } = payload as { name?: unknown; description?: unknown };

  const errors: Record<string, string> = {};
  if (typeof name !== "string" || !name.trim()) {
    errors.name = "required";
  } else if (name.trim().length > 120) {
    errors.name = "must be at most 120 characters";
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    errors.description = "must be a string";
  } else if (typeof description === "string" && description.length > 2000) {
    errors.description = "must be at most 2000 characters";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("halls")
    .insert({ name: (name as string).trim(), description: (description as string | undefined)?.trim() || null })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "validation_failed", details: { name: "a hall with this name already exists" } },
        { status: 409 }
      );
    }
    console.error("[halls.create] insert failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

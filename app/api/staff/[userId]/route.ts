import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

// Staff-only: change another staff member's email (their auth identity, not
// their password - see reset-password/route.ts for why that one only ever
// sends a link rather than setting a password directly).
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { userId } = await context.params;
  const payload = await request.json().catch(() => ({}));
  const { email } = payload as { email?: unknown };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "validation_failed", details: { email: "укажите корректный email" } }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { email: normalizedEmail, email_confirm: true });
  if (error) {
    console.error("[staff.update] updateUserById failed", error);
    return NextResponse.json(
      { error: "validation_failed", details: { email: "не удалось изменить email - возможно, он уже занят" } },
      { status: 400 }
    );
  }
  console.info("[staff.update] email changed", { actor: staff.id, target: userId });
  return NextResponse.json({ user_id: userId, email: normalizedEmail });
}

// Staff-only: revoke another staff member's access (soft - flips
// staff.active off, same reversible pattern as dining_tables.is_active,
// rather than deleting their auth account outright). Re-inviting the same
// email through POST /api/staff flips it back on. Can't deactivate yourself
// - that would either brick the panel (if you're the only admin) or at
// minimum lock you out of undoing a mistake.
export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { userId } = await context.params;
  if (userId === staff.id) {
    return NextResponse.json({ error: "нельзя отключить собственный доступ" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("staff")
    .update({ active: false }, { count: "exact" })
    .eq("user_id", userId);
  if (error) {
    console.error("[staff.deactivate] update failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "сотрудник не найден" }, { status: 404 });
  }
  console.info("[staff.deactivate] deactivated", { actor: staff.id, target: userId });
  return new NextResponse(null, { status: 204 });
}

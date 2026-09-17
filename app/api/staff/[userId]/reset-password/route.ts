import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

// Staff-only: send another staff member a password-reset link. Deliberately
// never sets a password directly - the same reasoning as staff/route.ts's
// POST: a staff member choosing a password for a colleague's account is
// indistinguishable from taking it over, so the only path here is the
// target's own inbox.
export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { userId } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "сотрудник не найден" }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured");
  }
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: resetError } = await anon.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${request.nextUrl.origin}/hostess/reset-password`,
  });
  if (resetError) {
    console.error("[staff.reset-password] resetPasswordForEmail failed", resetError);
    return NextResponse.json({ error: "не удалось отправить письмо, попробуйте позже" }, { status: 500 });
  }

  console.info("[staff.reset-password] link sent", { actor: staff.id, target: userId });
  return NextResponse.json({ email: data.user.email });
}

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";

// Staff-only: list every staff account (email + active flag) so the
// hostess panel can show who already has access before adding someone new.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("staff")
    .select("user_id, active, created_at")
    .order("created_at");
  if (error) {
    console.error("[staff.list] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  const result = await Promise.all(
    rows.map(async (row) => {
      const { data, error: lookupError } = await admin.auth.admin.getUserById(row.user_id);
      if (lookupError) {
        console.error("[staff.list] getUserById failed", row.user_id, lookupError);
      }
      return {
        user_id: row.user_id,
        email: data?.user?.email ?? null,
        active: row.active,
        created_at: row.created_at,
      };
    })
  ).catch((err) => {
    console.error("[staff.list] unexpected failure resolving emails", err);
    return null;
  });

  if (result === null) {
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  return NextResponse.json(result);
}

// Staff-only: grant another account admin (staff) access.
//
// Deliberately never sets a password on an EXISTING account, even one with
// no staff row yet (e.g. a guest who signed in earlier via magic-link OTP -
// this app lets anyone create an auth.users row that way). The first
// version of this route did set one, which meant any staff member could
// type in a colleague's email, choose a password of their own, and take
// over that account outright - caught in self-review before this shipped.
// An existing account is granted access and sent a real password-reset
// email instead; only a brand-new account gets the operator-supplied
// password, since nobody else's credentials exist yet to overwrite.
export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const { email, password } = payload as { email?: unknown; password?: unknown };

  const errors: Record<string, string> = {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = "укажите корректный email";
  }
  if (typeof password !== "string" || password.length < 8) {
    errors.password = "не короче 8 символов";
  } else if (password.length > 72) {
    errors.password = "не длиннее 72 символов";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existingUserId, error: lookupError } = await admin.rpc("find_auth_user_id_by_email", {
    p_email: normalizedEmail,
  });
  if (lookupError) {
    console.error("[staff.create] find_auth_user_id_by_email failed", lookupError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  if (existingUserId) {
    const { data: existingStaff, error: existingStaffError } = await admin
      .from("staff")
      .select("active")
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (existingStaffError) {
      console.error("[staff.create] existing staff lookup failed", existingStaffError);
      return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
    }
    if (existingStaff?.active) {
      return NextResponse.json(
        { error: "validation_failed", details: { email: "этот аккаунт уже сотрудник" } },
        { status: 409 }
      );
    }

    const { error: upsertError } = await admin
      .from("staff")
      .upsert({ user_id: existingUserId, active: true, created_by: staff.id }, { onConflict: "user_id" });
    if (upsertError) {
      console.error("[staff.create] staff upsert failed", upsertError);
      return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
    }
    console.info("[staff.create] granted (existing account)", { actor: staff.id, target: existingUserId });

    // Best-effort - the account already has staff access either way, and
    // they can always use "Забыли пароль?" themselves if this email fails.
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      await anon.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${request.nextUrl.origin}/hostess/reset-password`,
      });
    } catch (err) {
      console.error("[staff.create] resetPasswordForEmail failed", err);
    }

    return NextResponse.json(
      { user_id: existingUserId, email: normalizedEmail, active: true, promoted: true },
      { status: 201 }
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: password as string,
    email_confirm: true,
  });
  if (createError) {
    console.error("[staff.create] createUser failed", createError);
    return NextResponse.json(
      { error: "validation_failed", details: { email: "не удалось создать аккаунт с этим email" } },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin
    .from("staff")
    .insert({ user_id: created.user.id, active: true, created_by: staff.id });
  if (insertError) {
    console.error("[staff.create] staff insert failed", insertError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  console.info("[staff.create] granted (new account)", { actor: staff.id, target: created.user.id });

  return NextResponse.json(
    { user_id: created.user.id, email: normalizedEmail, active: true, promoted: false },
    { status: 201 }
  );
}

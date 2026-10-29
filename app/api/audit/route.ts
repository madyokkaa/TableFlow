import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { isMissingSchemaError, MIGRATION_PENDING_MESSAGE } from "@/lib/schemaErrors";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const NAME_PATTERN = /^[a-z_.]{1,80}$/;

type AuditRow = {
  id: number;
  at: string;
  actor_user_id: string | null;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
};

// Staff-only: the journal, newest first. Cursor pagination by id - pass the
// previous page's next_before as ?before= to get the next one.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const beforeParam = searchParams.get("before");
  const entity = searchParams.get("entity");
  const action = searchParams.get("action");

  const errors: Record<string, string> = {};
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) errors.limit = `целое число от 1 до ${MAX_LIMIT}`;
  }
  let before: number | null = null;
  if (beforeParam !== null) {
    before = Number(beforeParam);
    if (!Number.isInteger(before) || before < 1) errors.before = "должно быть положительным целым числом";
  }
  if (entity !== null && !NAME_PATTERN.test(entity)) errors.entity = "некорректное значение";
  if (action !== null && !NAME_PATTERN.test(action)) errors.action = "некорректное значение";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("audit_log")
    .select("id, at, actor_user_id, actor_role, action, entity, entity_id, details")
    .order("id", { ascending: false })
    .limit(limit);
  if (before !== null) query = query.lt("id", before);
  if (entity) query = query.eq("entity", entity);
  if (action) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 409 });
    }
    console.error("[audit.list] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  const rows = (data ?? []) as AuditRow[];

  // "Who" is shown as the staff member's email, looked up at read time -
  // the journal itself only ever stores the account id.
  const emails = new Map<string, string>();
  if (rows.some((r) => r.actor_role === "staff" && r.actor_user_id)) {
    const { data: staffRows, error: staffError } = await admin.rpc("list_staff_with_email");
    if (staffError) {
      console.error("[audit.list] list_staff_with_email failed", staffError);
    } else {
      for (const s of (staffRows ?? []) as { user_id: string; email: string | null }[]) {
        if (s.email) emails.set(s.user_id, s.email);
      }
    }
  }

  const items = rows.map((r) => ({
    ...r,
    actor_email: r.actor_role === "staff" && r.actor_user_id ? (emails.get(r.actor_user_id) ?? null) : null,
  }));

  return NextResponse.json({
    items,
    next_before: rows.length === limit ? rows[rows.length - 1].id : null,
  });
}

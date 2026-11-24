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

type Admin = ReturnType<typeof createAdminClient>;
type Resolved = Map<string, Record<string, unknown>> & { tableLabels: Map<number, string> };

const ids = (rows: AuditRow[], entity: string) => [
  ...new Set(
    rows.filter((r) => r.entity === entity && r.entity_id && /^\d+$/.test(r.entity_id)).map((r) => Number(r.entity_id))
  ),
];

/** What each journal row is about, as it is now - looked up when the
 * journal is read (the journal itself stores ids only). A missing entry
 * means the object has since been deleted. Guest names come from the
 * booking itself and are only shown to staff, who see them in the bookings
 * list anyway. */
async function resolveObjects(admin: Admin, rows: AuditRow[], emails: Map<string, string>): Promise<Resolved> {
  const out = new Map<string, Record<string, unknown>>() as Resolved;
  out.tableLabels = new Map();

  // Tables named in reservation changes (table_ids before → after).
  const changedTableIds = new Set<number>();
  for (const r of rows) {
    const change = (r.details.changes as Record<string, { from: unknown; to: unknown }> | undefined)?.table_ids;
    for (const v of [change?.from, change?.to])
      if (Array.isArray(v)) v.forEach((id) => Number.isInteger(id) && changedTableIds.add(id));
  }

  const reservationIds = ids(rows, "reservation");
  const tableIds = [...new Set([...ids(rows, "table"), ...changedTableIds])];
  const hallIds = ids(rows, "hall");
  const objectIds = ids(rows, "hall_object");

  const [reservations, tables, halls, hallObjects] = await Promise.all([
    reservationIds.length
      ? admin
          .from("reservations")
          .select(
            "id, date, start_time, duration_minutes, party_size, guest_name, status, source, cancelled_by, cancellation_reason, reservation_tables(table_id, dining_tables(label, halls(name)))"
          )
          .in("id", reservationIds)
      : null,
    tableIds.length
      ? admin
          .from("dining_tables")
          .select("id, label, min_capacity, max_capacity, is_active, manual_status, hall_id, halls(name)")
          .in("id", tableIds)
      : null,
    hallIds.length ? admin.from("halls").select("id, name").in("id", hallIds) : null,
    objectIds.length
      ? admin.from("hall_objects").select("id, kind, label, hall_id, halls(name)").in("id", objectIds)
      : null,
  ]);

  for (const [entity, result] of [
    ["reservation", reservations],
    ["table", tables],
    ["hall", halls],
    ["hall_object", hallObjects],
  ] as const) {
    if (!result) continue;
    if (result.error) {
      console.error("[audit.list] resolving objects failed", { entity, code: result.error.code });
      continue;
    }
    for (const row of result.data as unknown as Record<string, unknown>[]) {
      out.set(`${entity}:${row.id}`, row);
      if (entity === "table") out.tableLabels.set(row.id as number, row.label as string);
    }
  }

  for (const id of new Set(rows.filter((r) => r.entity === "staff" && r.entity_id).map((r) => r.entity_id!))) {
    if (emails.has(id)) out.set(`staff:${id}`, { email: emails.get(id) });
  }
  return out;
}

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
  if (rows.some((r) => (r.actor_role === "staff" && r.actor_user_id) || r.entity === "staff")) {
    const { data: staffRows, error: staffError } = await admin.rpc("list_staff_with_email");
    if (staffError) {
      console.error("[audit.list] list_staff_with_email failed", staffError);
    } else {
      for (const s of (staffRows ?? []) as { user_id: string; email: string | null }[]) {
        if (s.email) emails.set(s.user_id, s.email);
      }
    }
  }

  const objects = await resolveObjects(admin, rows, emails);

  const items = rows.map((r) => ({
    ...r,
    actor_email: r.actor_role === "staff" && r.actor_user_id ? (emails.get(r.actor_user_id) ?? null) : null,
    object: r.entity_id ? (objects.get(`${r.entity}:${r.entity_id}`) ?? null) : null,
  }));

  return NextResponse.json({
    items,
    table_labels: Object.fromEntries(objects.tableLabels),
    next_before: rows.length === limit ? rows[rows.length - 1].id : null,
  });
}

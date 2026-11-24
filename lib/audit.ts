import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditRole = "staff" | "guest" | "system";

export type AuditEntry = {
  /** auth.users id of whoever did it; null for anonymous guests and jobs. */
  actor: string | null;
  role: AuditRole;
  /** "<entity>.<verb>", e.g. "reservation.status_changed". */
  action: string;
  entity: string;
  entityId?: string | number | null;
  /** Identifiers and names of changed fields only - never a guest's name,
   * phone or email, nor a staff member's email. */
  details?: Record<string, unknown>;
};

/** Appends one row to audit_log. Never throws: a journal failure must not
 * fail the change it describes, so it's logged (ids only) and reported as
 * false. Callers await it before responding - on serverless, work left
 * running after the response may never finish. */
export async function logAudit(supabase: SupabaseClient, entry: AuditEntry): Promise<boolean> {
  const row = {
    actor_user_id: entry.actor,
    actor_role: entry.role,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    details: entry.details ?? {},
  };
  try {
    const { error } = await supabase.from("audit_log").insert(row);
    if (!error) return true;
    console.error("[audit] write failed", { action: row.action, entity: row.entity, entityId: row.entity_id }, error);
  } catch (err) {
    console.error("[audit] write threw", { action: row.action, entity: row.entity, entityId: row.entity_id }, err);
  }
  return false;
}

/** logAudit for changes to staff access (added/removed, password reset):
 * same never-throw contract, plus an explicit error line naming the action
 * when the journal couldn't be written, so a gap in that part of the
 * history is never silent. */
export async function logAuditCritical(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  if (!(await logAudit(supabase, entry))) {
    console.error(`[audit] AUDIT LOG NOT WRITTEN for ${entry.action}`, { actor: entry.actor, entityId: entry.entityId });
  }
}

/** Comparable form of a field value: blank and null are the same, strings
 * are trimmed, "19:00:00" equals "19:00", id lists ignore order. */
function comparable(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "null";
    return JSON.stringify(/^\d{2}:\d{2}:00$/.test(trimmed) ? trimmed.slice(0, 5) : trimmed);
  }
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value);
}

export type ValueChange = { from: unknown; to: unknown };

function storable(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^\d{2}:\d{2}:00$/.test(trimmed) ? trimmed.slice(0, 5) : trimmed;
  }
  if (Array.isArray(value)) return [...value].sort();
  return value;
}

/** Before → after for the given keys that a PATCH body actually changes.
 * Only for fields that hold no personal data (dates, times, sizes, table
 * ids, statuses, labels) - callers pass those keys only. */
export function valueChanges(
  body: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: readonly string[]
): Record<string, ValueChange> {
  const changes: Record<string, ValueChange> = {};
  for (const key of changedFields(body, current, keys)) {
    changes[key] = { from: storable(current[key]), to: storable(body[key]) };
  }
  return changes;
}

/** Names (never values) of the keys a PATCH body sets to something other
 * than what's stored, for `details.fields` - edit forms resend every field,
 * so "present in the body" alone would list them all. */
export function changedFields(
  body: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: readonly string[]
): string[] {
  return keys.filter((key) => body[key] !== undefined && comparable(body[key]) !== comparable(current[key]));
}

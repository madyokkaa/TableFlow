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

/** Names of the keys a PATCH body actually set, for `details.fields`. */
export function changedFields(body: Record<string, unknown>, allowed: readonly string[]): string[] {
  return allowed.filter((key) => body[key] !== undefined);
}

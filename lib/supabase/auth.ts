import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";

export type AuthenticatedUser = { id: string; email: string | null };

/**
 * Verifies the caller's Supabase access token (sent as
 * `Authorization: Bearer <token>` by the browser client after login) and
 * returns the corresponding user, or null if missing/invalid. This is the
 * API-level auth check - RLS on the tables is the independent second layer
 * if something ever queries Supabase directly instead of through this API.
 */
export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured");
  }

  const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Same as getAuthenticatedUser, but additionally requires an active `staff` row. */
export async function requireStaff(request: Request): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin.from("staff").select("active").eq("user_id", user.id).maybeSingle();
  if (!data?.active) return null;

  return user;
}

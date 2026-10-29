import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";

export type AuthenticatedUser = { id: string; email: string | null };

// One client per server instance, so the project's public signing keys
// (JWKS) it downloads to verify tokens are fetched once and reused, rather
// than once per request.
let verifier: SupabaseClient | null = null;

function tokenVerifier(): SupabaseClient {
  if (verifier) return verifier;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured");
  }
  verifier = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return verifier;
}

/**
 * Verifies the caller's Supabase access token (sent as
 * `Authorization: Bearer <token>` by the browser client after login) and
 * returns the corresponding user, or null if missing/invalid. This is the
 * API-level auth check - RLS on the tables is the independent second layer
 * if something ever queries Supabase directly instead of through this API.
 *
 * The project signs tokens with an asymmetric key, so `getClaims` checks the
 * signature and expiry locally against the cached public key - no round trip
 * to the Auth server per request (it falls back to one if the project ever
 * goes back to a shared-secret key). Trade-off: a token stays accepted until
 * it expires (at most an hour) even after sign-out; staff access itself is
 * still re-checked against the `staff` table on every call (requireStaff).
 */
export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const { data, error } = await tokenVerifier().auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub || claims.role !== "authenticated") return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  } catch {
    // getClaims throws (rather than returning an error) on a token that
    // isn't even well-formed - that's still just "not signed in".
    return null;
  }
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

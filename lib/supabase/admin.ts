import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

/**
 * Service-role client - bypasses RLS entirely. Server-side only; never
 * import this from a Client Component or leak the key to the browser.
 * Route handlers use this for the actual privileged read/write, after
 * authenticating the caller themselves (see auth.ts) - RLS in the DB is
 * the independent second layer, not the only one.
 *
 * One client per server instance: it holds no per-request state (no
 * session), and reusing it keeps its HTTP connections to Supabase warm
 * instead of setting a client up again on every request.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  if (cached?.url === url && cached.key === serviceRoleKey) return cached.client;
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  cached = { url, key: serviceRoleKey, client };
  return client;
}

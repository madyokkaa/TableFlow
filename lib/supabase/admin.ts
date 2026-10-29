import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client - bypasses RLS entirely. Server-side only; never
 * import this from a Client Component or leak the key to the browser.
 * Route handlers use this for the actual privileged read/write, after
 * authenticating the caller themselves (see auth.ts) - RLS in the DB is
 * the independent second layer, not the only one.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

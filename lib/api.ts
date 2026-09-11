import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** fetch() wrapper that attaches the current Supabase session as a Bearer
 * token, for calling our own /api/* route handlers from client components. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(path, { ...init, headers });
}

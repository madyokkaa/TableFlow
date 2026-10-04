import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { invalidateFloorData } from "@/lib/floorData";

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

  const response = await fetch(path, { ...init, headers });
  // Any write to halls/tables (editor, halls page) makes the shared
  // floor-data cache stale - drop it so the next reader sees the change.
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && /^\/api\/(halls|tables)(\/|\?|$)/.test(path)) invalidateFloorData();
  return response;
}

/** Extracts a display-ready message from one of our API's error responses -
 * `{error:"validation_failed", details:{...}}` joins the field messages,
 * anything else falls back to `error` itself (already Russian at the
 * source) or a generic message. Single place checking the
 * "validation_failed" discriminator, since every route uses it. */
export async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (body.error === "validation_failed") {
    return Object.values(body.details ?? {}).join(" ");
  }
  return body.error ?? "Что-то пошло не так.";
}

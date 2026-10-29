import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (anon key, subject to RLS) - used by
 * 'use client' components for auth (magic link / OTP / password sign-in)
 * and to grab the access token attached as an Authorization header on
 * fetch() calls to our own /api/* route handlers.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured");
  }
  return createBrowserClient(url, anonKey);
}

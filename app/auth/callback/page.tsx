"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // createBrowserSupabaseClient() forces PKCE + detectSessionInUrl, so the
    // client already exchanges the code (and consumes the verifier) during
    // its own init - calling exchangeCodeForSession() again here raced that
    // and always failed with a "missing code verifier" error, even though
    // the session had actually been established. Just wait for the session
    // the client already produced.
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");
    if (errorDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading redirect-time URL state on mount
      setError(errorDescription);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let redirected = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !redirected) {
        redirected = true;
        router.replace("/");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !redirected) {
        redirected = true;
        router.replace("/");
      }
    });

    const timeout = setTimeout(() => {
      if (!redirected) setError("This link expired or was already used. Request a new one.");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <p className="font-display text-2xl text-ink">That link didn&apos;t work</p>
          <p className="mt-2 text-sm text-status-cancelled">{error}</p>
        </>
      ) : (
        <p className="text-sm text-muted">Signing you in…</p>
      )}
    </main>
  );
}

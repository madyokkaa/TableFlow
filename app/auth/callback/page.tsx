"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      router.replace("/");
    });
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

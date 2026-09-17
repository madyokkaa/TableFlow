"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarCheck, LogOut, User } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BackgroundBlobs } from "@/components/guest/BackgroundBlobs";
import { FloatingParticles } from "@/components/guest/FloatingParticles";
import { BookingFlow } from "@/components/guest/BookingFlow";

export default function GuestPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
  }

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8 sm:py-12">
      <BackgroundBlobs />
      <FloatingParticles />

      <div className="mb-8 flex items-center justify-between gap-4">
        <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-muted">
          <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          TableFlow
        </p>
        {/* Sign-in is an optional add-on, never a gate: the flow below works
            fully without a session - this is just a quiet way in. */}
        <nav className="flex shrink-0 items-center gap-4 text-sm">
          {session === undefined ? null : session ? (
            <>
              <a
                href="/account"
                className="flex items-center gap-1.5 text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
              >
                <User className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Мои брони
              </a>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Выйти
              </button>
            </>
          ) : (
            <a
              href="/account/login"
              className="text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
            >
              Войти
            </a>
          )}
        </nav>
      </div>

      <h1 className="text-balance font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
        Забронируйте столик
      </h1>
      <p className="mt-3 mb-10 text-pretty text-muted">Выберите стол на схеме зала, дату и время — мы всё подготовим.</p>

      <BookingFlow session={session ?? null} />
    </main>
  );
}

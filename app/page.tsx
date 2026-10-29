"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarDays, LogIn, LogOut, User } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BookingFlow } from "@/components/guest/BookingFlow";

const NAV_LINK = "inline-flex min-h-11 items-center gap-1.5 text-[13px] text-[#c9b6ae] transition-colors hover:text-ink";

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
    <div className="relative flex-1 overflow-hidden">
      <div className="gp-lamp" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-7">
        <header className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2.5 font-mono text-xs tracking-[0.28em] text-[#c9b6ae]">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-[#4a3833]">
              <CalendarDays className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            </span>
            TABLEFLOW
          </p>
          {/* Sign-in is an optional add-on, never a gate: the flow below works
              fully without a session - this is just a quiet way in. */}
          <nav className="flex items-center gap-5" aria-label="Аккаунт">
            {session === undefined ? null : session ? (
              <>
                <a href="/account" className={NAV_LINK}>
                  <User className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Мои брони
                </a>
                <button type="button" onClick={handleSignOut} className={NAV_LINK}>
                  <LogOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Выйти
                </button>
              </>
            ) : (
              <a href="/account/login" className={NAV_LINK}>
                <LogIn className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Войти
              </a>
            )}
          </nav>
        </header>

        <div className="flex flex-col gap-3">
          <h1 className="animate-[gp-up_.7s_cubic-bezier(.2,.8,.2,1)_both] font-display text-[clamp(38px,5vw,60px)] font-normal leading-[1.02] tracking-[-0.02em] text-balance">
            Забронируйте <em className="gp-underline italic text-claret">столик</em>
          </h1>
          <p className="max-w-[520px] animate-[gp-up_.7s_.1s_cubic-bezier(.2,.8,.2,1)_both] text-[15px] text-muted">
            Наведите на стол — увидите места. Выберите стол, дату и время, остальное мы подготовим.
          </p>
        </div>

        <BookingFlow session={session ?? null} />
      </main>
    </div>
  );
}

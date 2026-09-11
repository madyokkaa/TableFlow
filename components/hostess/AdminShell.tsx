"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/hostess", label: "Reservations" },
  { href: "/hostess/halls", label: "Halls" },
];

/** Wraps every protected /hostess/* page: redirects to /hostess/login if
 * there's no session, and renders the shared nav/sign-out chrome once
 * there is one. Login/forgot/reset-password pages don't use this. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/hostess/login");
        return;
      }
      setSession(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/hostess/login");
        return;
      }
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/hostess/login");
  }

  if (session === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <div className="skeleton h-10 w-48 rounded-lg" />
      </div>
    );
  }
  if (session === null) {
    return null; // redirecting
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow · Staff</p>
            <nav className="flex gap-1">
              {NAV.map((item) => {
                const active = item.href === "/hostess" ? pathname === "/hostess" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-claret-tint text-claret" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}

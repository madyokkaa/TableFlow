"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { unlockAudio } from "@/lib/notificationSound";
import { useReservationsRealtime } from "@/hooks/useReservationsRealtime";
import { SoundToggle } from "./SoundToggle";
import { DashboardIcon, CalendarIcon, HallIcon, StaffIcon, BellIcon } from "./icons";

const NAV = [
  { href: "/hostess/dashboard", label: "Дашборд", icon: DashboardIcon },
  { href: "/hostess", label: "Брони", icon: CalendarIcon },
  { href: "/hostess/halls", label: "Залы", icon: HallIcon },
  { href: "/hostess/staff", label: "Сотрудники", icon: StaffIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/hostess" ? pathname === "/hostess" : pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-claret-tint text-claret" : "text-muted hover:bg-line/50 hover:text-ink"
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden lg:inline">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Count of pending (unconfirmed) reservations, shown as the header bell's
 * badge - refreshed on mount and whenever any reservation changes, so it
 * stays accurate from any page in the panel, not just Брони. */
function useNotificationCount() {
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/reservations?status=pending");
      if (!res.ok) return;
      const rows: unknown[] = await res.json();
      setCount(rows.length);
    } catch {
      // Silent - a stale/missing badge count isn't worth surfacing an error for.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  useReservationsRealtime(() => load(), undefined, "hostess-reservations-badge");

  return count;
}

/** Wraps every protected /hostess/* page: redirects to /hostess/login if
 * there's no session, and renders the shared sidebar/header chrome once
 * there is one. Login/forgot/reset-password pages don't use this. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const notificationCount = useNotificationCount();

  const pageTitle = NAV.find((item) => isActive(pathname, item.href))?.label ?? "TableFlow";

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

  useEffect(() => {
    // A new-reservation sound needs an AudioContext unlocked by a real user
    // gesture first - the sound toggle click covers that, but a hostess who
    // never touches it should still hear notifications after any first tap
    // on the page.
    function handleFirstClick() {
      unlockAudio();
    }
    window.addEventListener("pointerdown", handleFirstClick, { once: true });
    return () => window.removeEventListener("pointerdown", handleFirstClick);
  }, []);

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

  const email = session.user.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex flex-1">
      <aside className="hidden w-[72px] shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-6 backdrop-blur-xl md:flex lg:w-60 lg:px-4">
        <div className="mb-8 px-1">
          <p className="font-mono text-[11px] uppercase leading-tight tracking-[0.2em] text-muted">
            <span className="hidden lg:inline">TableFlow · Персонал</span>
            <span className="lg:hidden">TF</span>
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks />
        </nav>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="px-3 py-1">
            <SoundToggle />
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-line/50 hover:text-ink"
          >
            <span className="hidden lg:inline">Выйти</span>
            <span className="lg:hidden" aria-hidden="true">
              ⏻
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface/60 px-5 py-4 backdrop-blur-xl md:px-8">
          <h1 className="font-display text-xl text-ink text-balance">{pageTitle}</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/hostess?status=pending"
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-line/50 hover:text-ink"
              title={notificationCount ? `${notificationCount} броней ожидают подтверждения` : "Уведомления"}
            >
              <BellIcon className="h-[18px] w-[18px]" />
              {!!notificationCount && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-claret px-1 text-[10px] font-semibold leading-none text-white">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-claret-tint font-display text-sm text-claret">
                {initial}
              </span>
              <span className="hidden text-sm text-muted md:inline">{email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-8 pb-24 md:px-8 md:pb-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-line bg-surface/90 backdrop-blur-xl md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-claret" : "text-muted"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

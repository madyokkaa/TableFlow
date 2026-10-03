"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import type { Session } from "@supabase/supabase-js";
import { CalendarDays, ChevronLeft, DoorOpen, LayoutDashboard, LogOut, Users } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { unlockAudio } from "@/lib/notificationSound";
import { clearStaffDevice, staffDeviceExpired } from "@/lib/staffDevice";
import { usePendingReservations } from "@/hooks/usePendingReservations";
import { useOccupancyNow } from "@/hooks/useOccupancyNow";
import { restaurantNowMinutes, restaurantTodayIso } from "@/lib/scheduling";
import { formatDateWithWeekday, pluralize } from "@/lib/ru";
import { NotificationBell } from "./NotificationBell";
import { SoundToggle } from "./SoundToggle";

const NAV = [
  { href: "/hostess/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/hostess", label: "Брони", icon: CalendarDays },
  { href: "/hostess/halls", label: "Залы и столы", icon: DoorOpen },
  { href: "/hostess/staff", label: "Сотрудники", icon: Users },
] as const;

const BOOKINGS_HREF = "/hostess";

// Nav rows are a fixed 52px with a 6px gap, so the sliding highlight can be
// positioned by index alone.
const NAV_ROW_STEP = 58;

const COLLAPSE_KEY = "tf.staff.sidebar-collapsed";

// Every /hostess/* page mounts its own AdminShell, so the shell remounts on
// each navigation. Remembering where the highlight last sat lets it slide
// from the previous item to the new one instead of popping into place.
let lastNavIndex: number | null = null;

function isActive(pathname: string, href: string): boolean {
  return href === BOOKINGS_HREF ? pathname === BOOKINGS_HREF : pathname.startsWith(href);
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const NARROW_QUERY = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Below md the sidebar is always icon-only (as in the prototype) - there's
 * no room for the full panel next to content on a phone. */
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  );
}

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Restaurant-local time (fixed UTC offset, see lib/scheduling) for the
 * header's "Смена" chip, re-read often enough to never lag a minute. */
function useRestaurantClock() {
  const [now, setNow] = useState(() => ({ minutes: restaurantNowMinutes(), today: restaurantTodayIso() }));
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow({ minutes: restaurantNowMinutes(), today: restaurantTodayIso() }),
      10_000
    );
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function LoadRing({ percent }: { percent: number | null }) {
  const filled = percent === null ? 0 : Math.max(0.02, percent / 100);
  return (
    <span className="relative h-11 w-11 shrink-0">
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={RING_RADIUS} fill="none" className="stroke-line" strokeWidth="4" />
        <motion.circle
          cx="22"
          cy="22"
          r={RING_RADIUS}
          fill="none"
          className="stroke-claret"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
          animate={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - filled) }}
          transition={{ duration: 1.1, ease: [0.6, 0, 0.2, 1] }}
        />
      </svg>
      <b className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium">
        {percent === null ? "—" : `${percent}%`}
      </b>
    </span>
  );
}

function SideCaption({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="whitespace-nowrap px-3 pt-1.5 font-mono text-[10px] tracking-[0.22em] text-muted"
    >
      {children}
    </motion.p>
  );
}

/** Wraps every protected /hostess/* page: redirects to /hostess/login if
 * there's no session, and renders the shared sidebar/header chrome once
 * there is one. Login/forgot/reset-password pages don't use this. */
export function AdminShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [collapsedPref, setCollapsedPref] = useState(readCollapsedPreference);
  const isNarrow = useIsNarrow();
  const { items: pending, remove: removePending } = usePendingReservations();
  const occupancy = useOccupancyNow();
  const clock = useRestaurantClock();

  const mini = isNarrow || collapsedPref;
  const activeIndex = NAV.findIndex((item) => isActive(pathname, item.href));
  const pageTitle = activeIndex >= 0 ? NAV[activeIndex].label : "TableFlow";
  const pendingCount = pending?.length ?? 0;
  const loadPercent =
    occupancy === null
      ? null
      : occupancy.totalActive
        ? Math.round((occupancy.occupied / occupancy.totalActive) * 100)
        : 0;

  // Captured once per mount: where the highlight starts its slide from.
  const [indicatorFrom] = useState(() => lastNavIndex ?? activeIndex);
  useEffect(() => {
    if (activeIndex >= 0) lastNavIndex = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/hostess/login");
        return;
      }
      if (staffDeviceExpired()) {
        // Signed in without "remember this device" and the browser has
        // been closed since - end that shift.
        clearStaffDevice();
        supabase.auth.signOut();
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

  function toggleCollapsed() {
    const next = !collapsedPref;
    setCollapsedPref(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Private mode / storage disabled - the toggle still works for this page.
    }
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    clearStaffDevice();
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
  const displayName = email.split("@")[0] || "Сотрудник";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh overflow-hidden bg-paper">
        <aside
          aria-label="Навигация"
          className={`relative z-30 my-3.5 ml-3.5 flex h-[calc(100dvh-28px)] shrink-0 flex-col gap-3.5 rounded-[28px] border border-line bg-[#1a1311] px-3 py-3.5 shadow-[0_30px_60px_-40px_#000] transition-[width] duration-500 ease-[cubic-bezier(0.6,0,0.2,1)] ${
            mini ? "w-[86px]" : "w-[268px]"
          }`}
        >
          {!isNarrow && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsedPref ? "Развернуть меню" : "Свернуть меню"}
              aria-expanded={!collapsedPref}
              className="group absolute -right-[22px] top-[21px] z-10 flex h-11 w-11 items-center justify-center"
            >
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line-strong bg-surface text-muted transition-[color,border-color,transform] duration-300 group-hover:scale-110 group-hover:border-claret group-hover:text-ink">
                <ChevronLeft
                  className={`h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
                    collapsedPref ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </span>
            </button>
          )}

          <div
            className={`flex min-h-[54px] items-center gap-3 whitespace-nowrap rounded-[20px] border border-line bg-surface-raised p-1.5 ${
              mini ? "justify-center" : ""
            }`}
          >
            <span className="logo-ripple relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-claret text-on-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
              </svg>
            </span>
            {!mini && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col gap-[3px]"
              >
                <b className="font-display text-[19px] font-normal leading-none">TableFlow</b>
                <small className="font-mono text-[9.5px] tracking-[0.22em] text-muted">ПЕРСОНАЛ</small>
              </motion.span>
            )}
          </div>

          {!mini && <SideCaption>РАБОТА</SideCaption>}
          <nav className="relative flex flex-col gap-1.5">
            {activeIndex >= 0 && (
              <motion.span
                aria-hidden="true"
                initial={{ y: Math.max(indicatorFrom, 0) * NAV_ROW_STEP }}
                animate={{ y: activeIndex * NAV_ROW_STEP }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="absolute inset-x-0 top-0 h-[52px] rounded-[18px] border border-claret/25 bg-claret-tint/70"
              >
                {!mini && (
                  <span className="absolute right-3.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-claret shadow-[0_0_10px_var(--color-claret)]" />
                )}
              </motion.span>
            )}
            {NAV.map(({ href, label, icon: Icon }, index) => {
              const active = index === activeIndex;
              const showBadge = href === BOOKINGS_HREF && pendingCount > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={showBadge ? `${label}: ${pendingCount} ожидают подтверждения` : label}
                  aria-current={active ? "page" : undefined}
                  className={`group relative z-[1] flex h-[52px] w-full items-center gap-3 whitespace-nowrap rounded-[18px] text-sm font-semibold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    mini ? "px-[11px]" : "px-2"
                  } ${active ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-[background-color,color,border-color,box-shadow,transform] duration-[450ms] ease-[cubic-bezier(0.3,1.6,0.5,1)] ${
                      active
                        ? "border-claret bg-claret text-on-accent shadow-[0_8px_22px_-8px_var(--color-claret)]"
                        : "border-line bg-surface-raised group-hover:-rotate-[8deg] group-hover:scale-[1.07] group-hover:border-line-strong"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  {!mini && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                      {label}
                    </motion.span>
                  )}
                  <AnimatePresence>
                    {showBadge && (
                      <motion.span
                        key="badge"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        aria-hidden="true"
                        className={`flex items-center justify-center rounded-full bg-status-pending font-bold text-on-accent ${
                          mini
                            ? "absolute left-9 top-1 h-[18px] min-w-[18px] px-1 text-[10px] shadow-[0_0_0_3px_#1a1311]"
                            : "ml-auto mr-6 h-[22px] min-w-[22px] px-1.5 text-[11px]"
                        }`}
                      >
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {mini && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[calc(100%+16px)] top-1/2 -translate-x-1.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-paper opacity-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                    >
                      {showBadge ? `${label} · ${pendingCount} ${pluralize(pendingCount, "ждёт", "ждут", "ждут")}` : label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {!mini && <SideCaption>СЕЙЧАС</SideCaption>}
          <Link
            href="/hostess/halls"
            aria-label={
              loadPercent === null
                ? "Загрузка зала"
                : `Загрузка зала ${loadPercent} процентов, ${occupancy?.occupied ?? 0} из ${occupancy?.totalActive ?? 0} столов заняты`
            }
            className={`flex items-center gap-3 whitespace-nowrap rounded-[20px] border border-line bg-surface-raised text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong ${
              mini ? "justify-center p-1.5" : "p-2.5"
            }`}
          >
            <LoadRing percent={loadPercent} />
            {!mini && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="flex min-w-0 flex-col gap-[3px]"
              >
                <b className="text-[13px] font-semibold">Загрузка зала</b>
                <small className="truncate text-[11px] text-muted">
                  {occupancy === null
                    ? "Загружаем…"
                    : `${occupancy.occupied} из ${occupancy.totalActive} ${pluralize(occupancy.totalActive, "стола", "столов", "столов")} · ${pendingCount} ${pluralize(pendingCount, "ждёт", "ждут", "ждут")}`}
                </small>
              </motion.span>
            )}
          </Link>

          <div
            className={`mt-auto flex items-center gap-1 whitespace-nowrap rounded-[20px] border border-line bg-surface-raised p-2 ${
              mini ? "flex-col justify-center" : ""
            }`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-claret-tint font-display text-base text-claret"
              title={email}
              aria-hidden="true"
            >
              {initial}
            </span>
            {!mini && (
              <span className="ml-1 flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-[13px] font-semibold" title={email}>
                  {displayName}
                </b>
                <small className="text-[11px] text-muted">Персонал</small>
              </span>
            )}
            <SoundToggle />
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Выйти"
              title="Выйти"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-[background-color,color,transform] duration-200 ease-out hover:bg-claret-tint hover:text-claret active:scale-90"
            >
              <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-3.5 border-b border-line bg-paper/85 pl-4 pr-4 backdrop-blur-md md:pl-9 md:pr-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={pageTitle}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                className="truncate font-display text-2xl font-normal text-ink"
              >
                {pageTitle}
              </motion.h1>
            </AnimatePresence>
            <span className="hidden h-[30px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-status-confirmed/25 bg-status-confirmed-tint px-3 font-mono text-xs text-status-confirmed md:inline-flex">
              <span className="animate-breathe h-[7px] w-[7px] rounded-full bg-status-confirmed" aria-hidden="true" />
              Смена · <time>{formatClock(clock.minutes)}</time>
            </span>
            <span className="flex-1" />
            <span className="hidden whitespace-nowrap text-[13px] text-muted lg:inline">
              {formatDateWithWeekday(clock.today)}
            </span>
            <NotificationBell pending={pending} onResolved={removePending} />
          </header>

          <main className="flex-1 px-4 pb-20 pt-6 md:px-8 md:pb-[90px] md:pl-9 md:pt-[30px]">
            <div className={`mx-auto w-full transition-[max-width] duration-400 ${wide ? "max-w-[1640px]" : "max-w-6xl"}`}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}

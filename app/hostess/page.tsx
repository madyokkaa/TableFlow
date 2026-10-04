"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CalendarRange, ChevronLeft, ChevronRight, List, Plus, Search } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useReservationsRealtime, type ReservationChangeEvent, type RealtimeStatus } from "@/hooks/useReservationsRealtime";
import { playNotificationSound } from "@/lib/notificationSound";
import { ALLOWED_STATUS_TRANSITIONS, HOST_CANCELLATION_REASONS, type ReservationStatus } from "@/lib/reservations";
import { formatDateWithWeekday, guestsLabel, pluralize } from "@/lib/ru";
import { addDaysIso, restaurantNowMinutes, restaurantTodayIso } from "@/lib/scheduling";
import { AdminShell } from "@/components/hostess/AdminShell";
import { CancelReservationDialog } from "@/components/CancelReservationDialog";
import { Toaster, useToast } from "@/components/hostess/Toast";
import { INPUT } from "@/components/hostess/hall-editor/controls";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";
import { BookingDrawer } from "@/components/hostess/bookings/BookingDrawer";
import { BookingGrid } from "@/components/hostess/bookings/BookingGrid";
import { BookingRow } from "@/components/hostess/bookings/BookingRow";
import type { DrawerTarget, Reservation } from "@/components/hostess/bookings/types";

const RESERVATION_SELECT = "*, reservation_tables(table_id, dining_tables(id, label, hall_id, halls(id, name)))";
const VIEW_KEY = "tf-bookings-view";
// Same as the toast's lifetime when it carries «Вернуть».
const UNDO_MS = 6000;

const STATUS_CHIPS: { value: ReservationStatus | "all"; label: string; always?: boolean }[] = [
  { value: "all", label: "Все", always: true },
  { value: "pending", label: "Ожидают", always: true },
  { value: "confirmed", label: "Подтверждены", always: true },
  { value: "cancelled", label: "Отменены", always: true },
  { value: "completed", label: "Завершены" },
  { value: "no-show", label: "Не пришли" },
];

type DeferredOp = { status: "confirmed" | "cancelled"; reason: string | null; timer: number };

function dayLabel(iso: string): string {
  const today = restaurantTodayIso();
  const long = formatDateWithWeekday(iso);
  const short = long.replace(/^[^,]+,\s*/, "");
  if (iso === today) return `Сегодня, ${short}`;
  if (iso === addDaysIso(today, 1)) return `Завтра, ${short}`;
  if (iso === addDaysIso(today, -1)) return `Вчера, ${short}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

function matchesQuery(r: Reservation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return (
    r.guest_name.toLowerCase().includes(q) ||
    (r.guest_email ?? "").toLowerCase().includes(q) ||
    (digits.length >= 3 && (r.guest_phone ?? "").replace(/\D/g, "").includes(digits)) ||
    r.reservation_tables.some((rt) => rt.dining_tables.label.toLowerCase() === q)
  );
}

function ReservationsPageContent() {
  const [date, setDate] = useState(restaurantTodayIso());
  const [hallFilter, setHallFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [rejectingReservation, setRejectingReservation] = useState<Reservation | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const [nowMinutes, setNowMinutes] = useState(() => restaurantNowMinutes());
  // ✓/✕ from the list change the status on screen at once but reach the
  // server only when the «Вернуть» window closes - the API has no way back
  // from confirmed/cancelled, so undo has to happen before the PATCH.
  const [overrides, setOverrides] = useState<Map<number, ReservationStatus>>(new Map());
  const deferredRef = useRef(new Map<number, DeferredOp>());
  const { toast, show, dismiss } = useToast();
  // A realtime event that arrives before the initial load resolves would
  // otherwise be silently dropped (the merge handler has nothing to merge
  // into yet) - buffer that it happened and force one more load once the
  // first one settles, rather than lose it until the hostess touches a
  // filter.
  const pendingDuringLoadRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // The whole day, every hall and status - the filters, counters and
      // search all work on this one list client-side.
      const [hallsRes, tablesRes, reservationsRes] = await Promise.all([
        fetch("/api/halls"),
        fetch("/api/tables"),
        apiFetch(`/api/reservations?${new URLSearchParams({ date }).toString()}`),
      ]);
      if (!hallsRes.ok || !tablesRes.ok || !reservationsRes.ok) {
        setLoadError(await parseError(!reservationsRes.ok ? reservationsRes : !hallsRes.ok ? hallsRes : tablesRes));
        setReservations([]);
        return;
      }
      setHalls(await hallsRes.json());
      setTables(await tablesRes.json());
      setReservations(await reservationsRes.json());
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    load().then(() => {
      if (pendingDuringLoadRef.current) {
        pendingDuringLoadRef.current = false;
        load();
      }
    });
  }, [load]);

  // Deep links: the bell's "?status=pending" and the dashboard's
  // "?reservation=<id>" (opens that booking on its own day). Read once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL on mount
    if (status === "pending" || status === "confirmed" || status === "cancelled") setStatusFilter(status);
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
    } catch {
      // Storage unavailable - stay on the list.
    }
    const reservationId = Number(params.get("reservation"));
    if (Number.isInteger(reservationId) && reservationId > 0) {
      createBrowserSupabaseClient()
        .from("reservations")
        .select(RESERVATION_SELECT)
        .eq("id", reservationId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          const reservation = data as Reservation;
          setDate(reservation.date);
          setDrawer({ kind: "edit", reservation });
        });
    }
    if (params.size > 0) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(restaurantNowMinutes()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Patches just the changed reservation into the current list instead of
  // reloading everything - a busy panel shouldn't re-fetch halls/tables and
  // re-render every row on every new booking.
  const handleRealtimeChange = useCallback(
    async (event: ReservationChangeEvent) => {
      if (reservations === null) {
        pendingDuringLoadRef.current = true;
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.from("reservations").select(RESERVATION_SELECT).eq("id", event.reservationId).maybeSingle();

      if (error) {
        // A transient failure here must never make a live reservation
        // silently vanish from the list - leave it untouched; the next
        // event (or a day change) will resync it.
        console.error("[hostess] realtime refetch failed", error);
        return;
      }

      const typedData = data as Reservation | null;
      const matchesDay = typedData !== null && typedData.date === date;

      // Two events can arrive for one new booking (the INSERT on
      // reservations, and the UPDATE synthesized from its reservation_tables
      // row) - `exists` is re-checked against the *current* state by React
      // on every functional setState call, so whichever event's update is
      // applied first is unambiguously the one that added the row, and the
      // other correctly sees it as already-existing. Side effects (sound,
      // highlight) stay outside the updater - it must stay pure.
      let didInsert = false;
      setReservations((prev) => {
        if (!prev) return prev;
        const exists = prev.some((r) => r.id === event.reservationId);
        if (!matchesDay) {
          return exists ? prev.filter((r) => r.id !== event.reservationId) : prev;
        }
        if (exists) {
          return prev.map((r) => (r.id === event.reservationId ? (typedData as Reservation) : r));
        }
        didInsert = true;
        return [...prev, typedData as Reservation];
      });

      if (didInsert) {
        playNotificationSound();
        pulseHighlight(event.reservationId);
      }
    },
    [date, reservations]
  );

  useReservationsRealtime(handleRealtimeChange, setRealtimeStatus);

  // Same brief claret pulse used for a new incoming booking, reused as the
  // "something about this row just changed" cue after a local action.
  function pulseHighlight(id: number) {
    setHighlightedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1800);
  }

  function dropOverride(id: number) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const commit = useCallback(
    async (id: number) => {
      const op = deferredRef.current.get(id);
      if (!op) return;
      deferredRef.current.delete(id);
      window.clearTimeout(op.timer);
      try {
        const res = await apiFetch(`/api/reservations/${id}`, {
          method: "PATCH",
          body: JSON.stringify(op.status === "cancelled" ? { status: "cancelled", cancellation_reason: op.reason } : { status: "confirmed" }),
          keepalive: true,
        });
        if (!res.ok) {
          dropOverride(id);
          show(await parseError(res), { tone: "error" });
          return;
        }
        setReservations((prev) => prev?.map((r) => (r.id === id ? { ...r, status: op.status } : r)) ?? prev);
        dropOverride(id);
      } catch {
        dropOverride(id);
        show("Не удалось сохранить статус — проверьте подключение", { tone: "error" });
      }
    },
    [show]
  );

  // Whatever is still waiting for its undo window is sent right away when
  // the hostess leaves the page or closes the tab.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useEffect(() => {
    const deferred = deferredRef.current;
    const flush = () => [...deferred.keys()].forEach((id) => commitRef.current(id));
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function scheduleStatus(reservation: Reservation, status: "confirmed" | "cancelled", reason: string | null = null) {
    const previous = deferredRef.current.get(reservation.id);
    if (previous) window.clearTimeout(previous.timer);
    const timer = window.setTimeout(() => commit(reservation.id), UNDO_MS);
    deferredRef.current.set(reservation.id, { status, reason, timer });
    setOverrides((prev) => new Map(prev).set(reservation.id, status));
    pulseHighlight(reservation.id);
    show(
      `${reservation.guest_name}, ${reservation.start_time.slice(0, 5)} — ${status === "confirmed" ? "подтверждена" : "отклонена"}`,
      {
        action: {
          label: "Вернуть",
          run: () => {
            const op = deferredRef.current.get(reservation.id);
            if (!op) return;
            window.clearTimeout(op.timer);
            deferredRef.current.delete(reservation.id);
            dropOverride(reservation.id);
          },
        },
      }
    );
  }

  // Rejecting - from the row's ✕ or the drawer - always asks for an
  // optional reason first, then goes through the same undo window as ✓.
  function handleReject(reason: string | null) {
    if (!rejectingReservation) return;
    setDrawer(null);
    scheduleStatus(rejectingReservation, "cancelled", reason);
  }

  const shown = useMemo(
    () => (reservations ?? []).map((r) => (overrides.has(r.id) ? { ...r, status: overrides.get(r.id) as ReservationStatus } : r)),
    [reservations, overrides]
  );
  const inScope = shown.filter(
    (r) => (hallFilter === "all" || r.reservation_tables.some((rt) => rt.dining_tables.hall_id === hallFilter)) && matchesQuery(r, query)
  );
  const counts = new Map<string, number>([["all", inScope.length]]);
  for (const r of inScope) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const visible = inScope
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const gridTables = tables
    .filter((t) => t.is_active && (hallFilter === "all" || t.hall_id === hallFilter))
    .sort((a, b) => a.hall_id - b.hall_id || a.label.localeCompare(b.label, "ru", { numeric: true }));
  const isToday = date === restaurantTodayIso();
  const expectedGuests = visible.filter((r) => r.status === "pending" || r.status === "confirmed").reduce((sum, r) => sum + r.party_size, 0);

  function chooseView(next: "list" | "grid") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered - fine.
    }
  }

  const openDrawer = useCallback((target: DrawerTarget) => setDrawer(target), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const editingReservation = drawer?.kind === "edit" ? (shown.find((r) => r.id === drawer.reservation.id) ?? drawer.reservation) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em]">Брони</h1>
          <p className="mt-1 text-sm text-muted">
            {visible.length} {pluralize(visible.length, "бронь", "брони", "броней")}
            {expectedGuests > 0 && ` · ждём ${guestsLabel(expectedGuests)}`}
            {realtimeStatus === "DISCONNECTED" && (
              <span className="ml-2 rounded-full bg-status-pending-tint px-2.5 py-0.5 text-xs text-status-pending">нет связи с обновлениями</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <div role="radiogroup" aria-label="Вид" className="relative grid grid-cols-2 rounded-[14px] border border-line-strong bg-[#1a1311] p-1">
            <span
              aria-hidden="true"
              className="absolute left-1 top-1 h-11 w-[calc(50%-4px)] rounded-[10px] border border-claret/30 bg-[#2e1c21] transition-transform duration-[450ms] ease-[cubic-bezier(.3,1.3,.5,1)]"
              style={{ transform: `translateX(${view === "grid" ? 100 : 0}%)` }}
            />
            {(
              [
                ["list", "Список", List],
                ["grid", "Шахматка", CalendarRange],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => chooseView(value)}
                className={`relative z-[1] flex h-11 items-center justify-center gap-2 px-4 text-[13px] font-semibold transition-colors ${view === value ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              openDrawer({
                kind: "create",
                date: date < restaurantTodayIso() ? restaurantTodayIso() : date,
                hallId: hallFilter === "all" ? undefined : hallFilter,
              })
            }
            className="group inline-flex h-[52px] items-center gap-2 whitespace-nowrap rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 hover:shadow-[0_14px_28px_-14px_var(--color-claret)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} aria-hidden="true" />
            Новая бронь
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-[1_1_240px] sm:max-w-[340px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8f7c75]" strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя, телефон или номер стола"
            aria-label="Поиск по броням"
            className={`${INPUT} pl-10`}
          />
        </label>
        <div className="inline-flex h-11 items-center gap-1 rounded-[13px] border border-line-strong bg-[#1a1311] px-1">
          <button
            type="button"
            onClick={() => setDate((d) => addDaysIso(d, -1))}
            aria-label="Предыдущий день"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <span key={date} className="min-w-[150px] animate-[gp-open_.35s_both] px-2 text-center text-[13px] font-semibold" aria-live="polite">
            {dayLabel(date)}
          </span>
          <button
            type="button"
            onClick={() => setDate((d) => addDaysIso(d, 1))}
            aria-label="Следующий день"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(restaurantTodayIso())}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
          >
            К сегодня
          </button>
        )}
        {halls.length > 1 && (
          <div role="radiogroup" aria-label="Зал" className="flex flex-wrap gap-1 rounded-[14px] border border-line-strong bg-[#1a1311] p-1">
            {[{ id: "all" as const, name: "Все залы" }, ...halls].map((h) => (
              <button
                key={h.id}
                type="button"
                role="radio"
                aria-checked={hallFilter === h.id}
                onClick={() => setHallFilter(h.id)}
                className={`h-9 rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors duration-300 ${
                  hallFilter === h.id ? "bg-[#2e1c21] text-ink shadow-[inset_0_0_0_1px_rgb(236_143_163/0.3)]" : "text-muted hover:text-ink"
                }`}
              >
                {h.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Статус">
        {STATUS_CHIPS.filter((c) => c.always || (counts.get(c.value) ?? 0) > 0).map((c) => {
          const on = statusFilter === c.value;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => setStatusFilter(c.value)}
              className={`inline-flex h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-[transform,background-color,color,border-color] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] ${
                on ? "border-ink bg-ink text-surface" : "border-line-strong text-[#c9b6ae] hover:-translate-y-0.5 hover:border-[#8a6a62]"
              }`}
            >
              {c.label}
              <b
                className={`inline-flex h-5 min-w-[22px] items-center justify-center rounded-[10px] px-1.5 font-mono text-[11px] transition-colors ${
                  on ? "bg-surface text-ink" : "bg-[#2a201d]"
                }`}
              >
                {counts.get(c.value) ?? 0}
              </b>
            </button>
          );
        })}
      </div>

      {loading && reservations === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-2xl border border-line" />
          ))}
        </div>
      ) : loadError ? (
        <p role="alert" className="rounded-[22px] border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
          {loadError}{" "}
          <button type="button" onClick={load} className="min-h-11 underline underline-offset-4">
            Повторить
          </button>
        </p>
      ) : view === "grid" ? (
        <BookingGrid
          tables={gridTables}
          halls={halls}
          reservations={visible}
          nowMinutes={isToday ? nowMinutes : null}
          onOpen={(reservation) => openDrawer({ kind: "edit", reservation })}
          onCreate={(tableId, hallId, time) => {
            if (date >= restaurantTodayIso()) openDrawer({ kind: "create", date, hallId, tableId, time });
          }}
        />
      ) : (
        <section aria-label="Список броней" className={`overflow-hidden rounded-[22px] border border-line bg-[#1a1412] transition-opacity ${loading ? "opacity-60" : ""}`}>
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-[#a8958e]">
              <svg width="54" height="54" viewBox="0 0 48 48" fill="none" stroke="#8f7c75" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="24" cy="24" r="10" />
                <rect x="20" y="5" width="8" height="5" rx="2" />
                <rect x="20" y="38" width="8" height="5" rx="2" />
              </svg>
              {query.trim() ? "Никого не нашли — попробуйте другое имя или телефон." : "На этот день броней нет."}
              {date >= restaurantTodayIso() && (
                <button
                  type="button"
                  onClick={() => openDrawer({ kind: "create", date })}
                  className="inline-flex h-11 items-center rounded-[13px] border border-line-strong px-[18px] text-sm font-semibold text-ink/90 transition-colors hover:border-[#8a6a62] hover:bg-surface-raised"
                >
                  Добавить бронь
                </button>
              )}
            </div>
          ) : (
            visible.map((reservation, index) => (
              <BookingRow
                key={reservation.id}
                reservation={reservation}
                tablesById={tablesById}
                nowMinutes={isToday ? nowMinutes : null}
                highlighted={highlightedIds.has(reservation.id)}
                index={index}
                onAccept={() => scheduleStatus(reservation, "confirmed")}
                onReject={() => setRejectingReservation(reservation)}
                onEdit={() => openDrawer({ kind: "edit", reservation })}
              />
            ))
          )}
        </section>
      )}

      <AnimatePresence>
        {drawer && (
          <BookingDrawer
            key={drawer.kind === "edit" ? `edit-${drawer.reservation.id}` : "create"}
            target={editingReservation ? { kind: "edit", reservation: editingReservation } : drawer}
            halls={halls}
            tables={tables}
            onClose={closeDrawer}
            onSaved={(message) => {
              setDrawer(null);
              show(message);
              load();
            }}
            onAccept={
              editingReservation?.status === "pending"
                ? (reservation) => {
                    setDrawer(null);
                    scheduleStatus(reservation, "confirmed");
                  }
                : undefined
            }
            onRequestReject={
              editingReservation && (ALLOWED_STATUS_TRANSITIONS[editingReservation.status] ?? []).includes("cancelled")
                ? (reservation) => setRejectingReservation(reservation)
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <CancelReservationDialog
        open={rejectingReservation !== null}
        onClose={() => setRejectingReservation(null)}
        onConfirm={handleReject}
        title="Отклонение брони"
        message={`Отклонить бронь для «${rejectingReservation?.guest_name}»? Стол снова станет доступен для новых броней.`}
        reasons={HOST_CANCELLATION_REASONS}
        confirmLabel="Отклонить бронь"
      />

      <Toaster toast={toast} onDismiss={dismiss} />
    </div>
  );
}

export default function HostessDashboard() {
  return (
    <AdminShell wide>
      <ReservationsPageContent />
    </AdminShell>
  );
}

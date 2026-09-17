"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, parseError } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useReservationsRealtime, type ReservationChangeEvent, type RealtimeStatus } from "@/hooks/useReservationsRealtime";
import { playNotificationSound } from "@/lib/notificationSound";
import {
  ALLOWED_STATUS_TRANSITIONS,
  HOST_CANCELLATION_REASONS,
  RESERVATION_STATUSES,
  STATUS_LABELS_RU,
  type ReservationStatus,
} from "@/lib/reservations";
import { guestsLabel } from "@/lib/ru";
import { restaurantTodayIso } from "@/lib/scheduling";
import { Combobox } from "@/components/Combobox";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";
import { CancelReservationDialog } from "@/components/CancelReservationDialog";
import { StatusPill } from "@/components/StatusPill";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";
import { ReservationEditModal, type Reservation } from "@/components/hostess/ReservationEditModal";

function ReservationsPageContent() {
  const [date, setDate] = useState(restaurantTodayIso());
  const [hallFilter, setHallFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [rejectingReservation, setRejectingReservation] = useState<Reservation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("DISCONNECTED");
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
      const params = new URLSearchParams({ date });
      if (hallFilter !== "all") params.set("hall_id", String(hallFilter));
      if (statusFilter !== "all") params.set("status", statusFilter);

      const [hallsRes, tablesRes, reservationsRes] = await Promise.all([
        fetch("/api/halls"),
        fetch("/api/tables"),
        apiFetch(`/api/reservations?${params.toString()}`),
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
  }, [date, hallFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    load().then(() => {
      if (pendingDuringLoadRef.current) {
        pendingDuringLoadRef.current = false;
        load();
      }
    });
  }, [load]);

  // Patches just the changed reservation into the current list instead of
  // reloading everything - a busy dashboard shouldn't re-fetch halls/tables
  // and re-render every row on every new booking.
  const handleRealtimeChange = useCallback(
    async (event: ReservationChangeEvent) => {
      if (reservations === null) {
        pendingDuringLoadRef.current = true;
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from("reservations")
        .select("*, reservation_tables(table_id, dining_tables(id, label, hall_id, halls(id, name)))")
        .eq("id", event.reservationId)
        .maybeSingle();

      if (error) {
        // A transient failure here must never make a live reservation
        // silently vanish from the dashboard - leave the list untouched;
        // the next event (or a manual filter change) will resync it.
        console.error("[hostess] realtime refetch failed", error);
        return;
      }

      const typedData = data as Reservation | null;
      const matchesFilters =
        typedData !== null &&
        typedData.date === date &&
        (statusFilter === "all" || typedData.status === statusFilter) &&
        (hallFilter === "all" || typedData.reservation_tables.some((rt) => rt.dining_tables.hall_id === hallFilter));

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
        if (!matchesFilters) {
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
        setHighlightedIds((prevSet) => new Set(prevSet).add(event.reservationId));
        setTimeout(() => {
          setHighlightedIds((prevSet) => {
            const next = new Set(prevSet);
            next.delete(event.reservationId);
            return next;
          });
        }, 1800);
      }
    },
    [date, hallFilter, statusFilter, reservations]
  );

  useReservationsRealtime(handleRealtimeChange, setRealtimeStatus);

  async function handleEdit(fields: {
    date: string;
    start_time: string;
    duration_minutes: number;
    party_size: number;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
    status: ReservationStatus;
    table_ids: number[];
  }) {
    if (!editingReservation) return;
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch(`/api/reservations/${editingReservation.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...fields,
        guest_phone: fields.guest_phone || null,
        guest_email: fields.guest_email || null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEditingReservation(null);
    load();
  }

  async function handleAccept() {
    if (!editingReservation) return;
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch(`/api/reservations/${editingReservation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEditingReservation(null);
    load();
  }

  async function handleReject(reason: string | null) {
    if (!rejectingReservation) return;
    const res = await apiFetch(`/api/reservations/${rejectingReservation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", cancellation_reason: reason }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res));
    }
    setEditingReservation(null);
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl text-ink text-balance">Брони</h1>
        {realtimeStatus === "DISCONNECTED" && (
          <p className="rounded-full bg-status-pending-tint px-3 py-1 text-xs text-status-pending">
            Нет связи с обновлениями в реальном времени
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Дата</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex w-48 flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Зал</span>
          <Combobox
            ariaLabel="Зал"
            options={[{ value: "all" as const, label: "Все залы" }, ...halls.map((h) => ({ value: h.id, label: h.name }))]}
            value={hallFilter}
            onChange={setHallFilter}
          />
        </label>
        <label className="flex w-48 flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Статус</span>
          <Combobox
            ariaLabel="Статус"
            options={[
              { value: "all" as const, label: "Все статусы" },
              ...RESERVATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS_RU[s] })),
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </label>
      </div>

      {loading || reservations === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl border border-line" />
          ))}
        </div>
      ) : loadError ? (
        <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
          {loadError}
        </p>
      ) : reservations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          Нет броней, подходящих под эти фильтры.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {[...reservations]
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((reservation) => {
              const tableLabels = reservation.reservation_tables
                .map((rt) => `${rt.dining_tables.halls.name} · ${rt.dining_tables.label}`)
                .join(", ");
              return (
                <div
                  key={reservation.id}
                  className={`flex flex-wrap items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-paper/60 ${
                    highlightedIds.has(reservation.id) ? "animate-new-row" : ""
                  }`}
                >
                  <div className="w-16 shrink-0 font-mono text-sm font-medium tabular-nums text-ink">
                    {reservation.start_time.slice(0, 5)}
                  </div>
                  <div className="w-40 shrink-0 text-sm text-muted">{tableLabels || "—"}</div>
                  <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-medium text-ink">
                      {reservation.guest_name} <span className="text-muted">· {guestsLabel(reservation.party_size)}</span>
                    </p>
                    <p className="text-xs text-muted">{reservation.guest_phone || reservation.guest_email}</p>
                    {reservation.status === "cancelled" && reservation.cancellation_reason && (
                      <p className="mt-0.5 text-xs text-status-cancelled">
                        {reservation.cancelled_by === "guest" ? "Гость: " : "Персонал: "}
                        {reservation.cancellation_reason}
                      </p>
                    )}
                  </div>
                  <StatusPill status={reservation.status} />
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setEditingReservation(reservation)}
                      className="text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
                    >
                      Изменить
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <Modal
        open={editingReservation !== null}
        onClose={() => setEditingReservation(null)}
        title={`Изменить бронь — ${editingReservation?.guest_name ?? ""}`}
      >
        {editingReservation && (
          <ReservationEditModal
            reservation={editingReservation}
            halls={halls}
            tables={tables}
            submitting={submitting}
            error={formError}
            onSubmit={handleEdit}
            onAccept={editingReservation.status === "pending" ? handleAccept : undefined}
            onRequestReject={
              (ALLOWED_STATUS_TRANSITIONS[editingReservation.status] ?? []).includes("cancelled")
                ? () => setRejectingReservation(editingReservation)
                : undefined
            }
          />
        )}
      </Modal>

      <CancelReservationDialog
        open={rejectingReservation !== null}
        onClose={() => setRejectingReservation(null)}
        onConfirm={handleReject}
        title="Отклонение брони"
        message={`Отклонить бронь для «${rejectingReservation?.guest_name}»? Стол снова станет доступен для новых броней.`}
        reasons={HOST_CANCELLATION_REASONS}
        confirmLabel="Отклонить бронь"
      />
    </>
  );
}

export default function HostessDashboard() {
  return (
    <AdminShell>
      <ReservationsPageContent />
    </AdminShell>
  );
}

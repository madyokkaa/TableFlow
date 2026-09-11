"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/lib/reservations";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusPill } from "@/components/StatusPill";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";
import { ReservationEditModal, type Reservation } from "@/components/hostess/ReservationEditModal";

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (body.error === "validation_failed") {
    return Object.values(body.details ?? {}).join(" ");
  }
  return body.error ?? "Something went wrong.";
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ReservationsPageContent() {
  const [date, setDate] = useState(todayIso());
  const [hallFilter, setHallFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setLoadError("Couldn't reach the server. Check your connection and try again.");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [date, hallFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    load();
  }, [load]);

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

  async function handleCancel() {
    if (!cancellingReservation) return;
    const res = await apiFetch(`/api/reservations/${cancellingReservation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res));
    }
    load();
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Front of house</p>
        <h1 className="mt-1 font-display text-3xl text-ink text-balance">Reservations</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Hall</span>
          <select
            value={hallFilter}
            onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
          >
            <option value="all">All halls</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReservationStatus | "all")}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm capitalize text-ink outline-none transition-colors focus:border-claret"
          >
            <option value="all">All statuses</option>
            {RESERVATION_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
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
          No reservations match these filters.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {[...reservations]
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((reservation) => {
              const tableLabels = reservation.reservation_tables
                .map((rt) => `${rt.dining_tables.halls.name} · ${rt.dining_tables.label}`)
                .join(", ");
              const canCancel = ["pending", "confirmed"].includes(reservation.status);
              return (
                <div key={reservation.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="w-16 shrink-0 font-mono text-sm font-medium tabular-nums text-ink">
                    {reservation.start_time.slice(0, 5)}
                  </div>
                  <div className="w-40 shrink-0 text-sm text-muted">{tableLabels || "—"}</div>
                  <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-medium text-ink">
                      {reservation.guest_name} <span className="text-muted">· {reservation.party_size}p</span>
                    </p>
                    <p className="text-xs text-muted">{reservation.guest_phone || reservation.guest_email}</p>
                  </div>
                  <StatusPill status={reservation.status} />
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setEditingReservation(reservation)}
                      className="text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
                    >
                      Edit
                    </button>
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => setCancellingReservation(reservation)}
                        className="text-status-cancelled underline decoration-status-cancelled/40 underline-offset-4 hover:brightness-90"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <Modal
        open={editingReservation !== null}
        onClose={() => setEditingReservation(null)}
        title={`Edit reservation — ${editingReservation?.guest_name ?? ""}`}
      >
        {editingReservation && (
          <ReservationEditModal
            reservation={editingReservation}
            halls={halls}
            tables={tables}
            submitting={submitting}
            error={formError}
            onSubmit={handleEdit}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={cancellingReservation !== null}
        onClose={() => setCancellingReservation(null)}
        onConfirm={handleCancel}
        title="Cancel reservation"
        message={`Cancel the reservation for "${cancellingReservation?.guest_name}"? The table will be freed up for new bookings.`}
        confirmLabel="Cancel reservation"
        danger
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

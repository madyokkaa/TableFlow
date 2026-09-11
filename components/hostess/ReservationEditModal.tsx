"use client";

import { useMemo, useState } from "react";
import { ALLOWED_STATUS_TRANSITIONS, type ReservationStatus } from "@/lib/reservations";
import type { Hall } from "./HallForm";
import type { DiningTable } from "./TableForm";

export type Reservation = {
  id: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  party_size: number;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  status: ReservationStatus;
  reservation_tables: { table_id: number; dining_tables: { id: number; label: string; hall_id: number; halls: { id: number; name: string } } }[];
};

export function ReservationEditModal({
  reservation,
  halls,
  tables,
  submitting,
  error,
  onSubmit,
}: {
  reservation: Reservation;
  halls: Hall[];
  tables: DiningTable[];
  submitting: boolean;
  error: string | null;
  onSubmit: (fields: {
    date: string;
    start_time: string;
    duration_minutes: number;
    party_size: number;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
    status: ReservationStatus;
    table_ids: number[];
  }) => void;
}) {
  const currentHallId = reservation.reservation_tables[0]?.dining_tables.hall_id ?? halls[0]?.id ?? 0;

  const [date, setDate] = useState(reservation.date);
  const [startTime, setStartTime] = useState(reservation.start_time.slice(0, 5));
  const [durationMinutes, setDurationMinutes] = useState(reservation.duration_minutes);
  const [partySize, setPartySize] = useState(reservation.party_size);
  const [guestName, setGuestName] = useState(reservation.guest_name);
  const [guestPhone, setGuestPhone] = useState(reservation.guest_phone ?? "");
  const [guestEmail, setGuestEmail] = useState(reservation.guest_email ?? "");
  const [status, setStatus] = useState<ReservationStatus>(reservation.status);
  const [hallId, setHallId] = useState(currentHallId);
  const [tableIds, setTableIds] = useState<number[]>(reservation.reservation_tables.map((rt) => rt.table_id));

  const hallTables = useMemo(() => tables.filter((t) => t.hall_id === hallId), [tables, hallId]);
  const combinedCapacity = useMemo(
    () => hallTables.filter((t) => tableIds.includes(t.id)).reduce((sum, t) => sum + t.max_capacity, 0),
    [hallTables, tableIds]
  );

  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[reservation.status] ?? [];
  const hasContact = guestPhone.trim() || guestEmail.trim();
  const valid = guestName.trim() && hasContact && partySize > 0 && tableIds.length > 0;

  function toggleTable(tableId: number) {
    setTableIds((prev) => (prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      date,
      start_time: startTime,
      duration_minutes: durationMinutes,
      party_size: partySize,
      guest_name: guestName.trim(),
      guest_phone: guestPhone.trim(),
      guest_email: guestEmail.trim(),
      status,
      table_ids: tableIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Time</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Duration (min)</span>
          <input
            type="number"
            min={15}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value) || 15))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Party size</span>
          <input
            type="number"
            min={1}
            max={100}
            value={partySize}
            onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Guest name</span>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Phone</span>
          <input
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Email</span>
          <input
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Table(s)</p>
        <select
          value={hallId}
          onChange={(e) => {
            setHallId(Number(e.target.value));
            setTableIds([]);
          }}
          className="mb-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
        >
          {halls.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {hallTables.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTable(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                tableIds.includes(t.id) ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
              }`}
            >
              {t.label} <span className="text-xs opacity-70">({t.min_capacity}-{t.max_capacity})</span>
            </button>
          ))}
        </div>
        <p className={`mt-2 text-xs ${combinedCapacity < partySize ? "text-status-cancelled" : "text-muted"}`}>
          Combined capacity: {combinedCapacity} {combinedCapacity < partySize && `(needs ${partySize})`}
        </p>
      </div>

      {allowedNextStatuses.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Status</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatus(reservation.status)}
              className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                status === reservation.status ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
              }`}
            >
              {reservation.status} (current)
            </button>
            {allowedNextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                  status === s ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !valid}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

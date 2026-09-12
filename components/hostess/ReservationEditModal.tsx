"use client";

import { useMemo, useState } from "react";
import { ALLOWED_STATUS_TRANSITIONS, STATUS_LABELS_RU, type ReservationStatus } from "@/lib/reservations";
import { guestsLabel } from "@/lib/ru";
import { Combobox, MultiCombobox } from "@/components/Combobox";
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
          <span className="font-medium text-ink">Дата</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Время</span>
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
          <span className="font-medium text-ink">Длительность (мин)</span>
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
          <span className="font-medium text-ink">Гостей</span>
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
        <span className="font-medium text-ink">Имя гостя</span>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Телефон</span>
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
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Стол(ы)</p>
        <div className="mb-2">
          <Combobox
            ariaLabel="Зал"
            options={halls.map((h) => ({ value: h.id, label: h.name }))}
            value={hallId}
            onChange={(id) => {
              setHallId(id);
              setTableIds([]);
            }}
          />
        </div>
        <MultiCombobox
          ariaLabel="Столы"
          placeholder="Выберите стол(ы)…"
          options={hallTables.map((t) => ({ value: t.id, label: `${t.label} (${t.min_capacity}–${t.max_capacity})` }))}
          values={tableIds}
          onChange={setTableIds}
        />
        <p className={`mt-2 text-xs ${combinedCapacity < partySize ? "text-status-cancelled" : "text-muted"}`}>
          Вместимость: {combinedCapacity} {combinedCapacity < partySize && `(нужно ${guestsLabel(partySize)})`}
        </p>
      </div>

      {allowedNextStatuses.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Статус</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatus(reservation.status)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                status === reservation.status ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
              }`}
            >
              {STATUS_LABELS_RU[reservation.status]} (текущий)
            </button>
            {allowedNextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  status === s ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
                }`}
              >
                {STATUS_LABELS_RU[s]}
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
        {submitting ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>
  );
}

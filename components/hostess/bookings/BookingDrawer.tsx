"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, X } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { ALLOWED_STATUS_TRANSITIONS, STATUS_LABELS_RU, type ReservationStatus } from "@/lib/reservations";
import { DEFAULT_DURATION_MINUTES, restaurantTodayIso } from "@/lib/scheduling";
import { staffSlots, takenSlots, type SlotBooking } from "@/lib/bookingSlots";
import { guestsLabel, pluralize } from "@/lib/ru";
import { formatPhoneInput } from "@/lib/phone";
import { isValidEmail } from "@/lib/validation";
import { CAPTION, Field, INPUT, Segmented, Stepper } from "@/components/hostess/hall-editor/controls";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { DrawerTarget, Reservation } from "./types";

const DURATIONS = [60, 90, 120, 150, 180, 240];

function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

const toSlotBookings = (rows: Reservation[]): SlotBooking[] =>
  rows.map((r) => ({
    id: r.id,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes,
    status: r.status,
    table_ids: r.reservation_tables.map((rt) => rt.table_id),
  }));

/** Other bookings of the drawer's day, for crossing out taken slots. The
 * page's own list is reused when it's for the same day (and kept live by
 * realtime); only another day is fetched. */
function useDayBookings(date: string, knownDay?: { date: string; reservations: Reservation[] }) {
  const [fetched, setFetched] = useState<{ date: string; bookings: SlotBooking[] } | null>(null);
  const known = knownDay?.date === date ? knownDay.reservations : null;
  const needFetch = !known;
  useEffect(() => {
    if (!needFetch) return;
    let cancelled = false;
    apiFetch(`/api/reservations?date=${date}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as Reservation[];
        if (cancelled) return;
        setFetched({ date, bookings: toSlotBookings(rows) });
      })
      .catch(() => {
        // Without the day's bookings nothing is crossed out; the server
        // still rejects a real overlap on save.
      });
    return () => {
      cancelled = true;
    };
  }, [date, needFetch]);
  return useMemo(() => {
    if (known) return toSlotBookings(known);
    return fetched?.date === date ? fetched.bookings : [];
  }, [known, fetched, date]);
}

/** Side drawer for editing or creating a booking: guest, party size, day,
 * hall, table(s), half-hour time slots (taken ones crossed out for the
 * chosen tables), status. Warns when the tables seat fewer than the party.
 * Saving goes through the same endpoints as before: PATCH for an edit; a
 * new booking is created exactly like a guest's, then confirmed if asked. */
export function BookingDrawer({
  target,
  halls,
  tables,
  onClose,
  onSaved,
  onAccept,
  onRequestReject,
  knownDay,
}: {
  target: DrawerTarget;
  halls: Hall[];
  tables: DiningTable[];
  /** The page's own list for the day it shows - reused instead of fetched. */
  knownDay?: { date: string; reservations: Reservation[] };
  onClose: () => void;
  onSaved: (message: string) => void;
  onAccept?: (reservation: Reservation) => void;
  onRequestReject?: (reservation: Reservation) => void;
}) {
  const editing = target.kind === "edit" ? target.reservation : null;
  const firstHallId =
    editing?.reservation_tables[0]?.dining_tables.hall_id ??
    (target.kind === "create" ? target.hallId : undefined) ??
    halls[0]?.id ??
    0;

  const [guestName, setGuestName] = useState(editing?.guest_name ?? "");
  const [guestPhone, setGuestPhone] = useState(formatPhoneInput(editing?.guest_phone ?? ""));
  const [guestEmail, setGuestEmail] = useState(editing?.guest_email ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [partySize, setPartySize] = useState(editing?.party_size ?? 2);
  const [date, setDate] = useState(editing?.date ?? (target.kind === "create" ? target.date : restaurantTodayIso()));
  const [duration, setDuration] = useState(editing?.duration_minutes ?? DEFAULT_DURATION_MINUTES);
  const [hallId, setHallId] = useState(firstHallId);
  const [tableIds, setTableIds] = useState<number[]>(
    editing ? editing.reservation_tables.map((rt) => rt.table_id) : target.kind === "create" && target.tableId ? [target.tableId] : []
  );
  const [startTime, setStartTime] = useState(
    editing?.start_time.slice(0, 5) ?? (target.kind === "create" ? target.time ?? "" : "")
  );
  const [status, setStatus] = useState<ReservationStatus>(editing?.status ?? "pending");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      // Escape closes a dialog opened over the drawer (e.g. the reject
      // reason) first - not the drawer underneath it.
      if (e.key === "Escape" && document.querySelectorAll('[aria-modal="true"]').length <= 1) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dayBookings = useDayBookings(date, knownDay);
  const slots = useMemo(() => staffSlots(editing?.date === date ? editing.start_time : undefined), [editing, date]);
  const taken = useMemo(
    () => takenSlots(slots, dayBookings, tableIds, duration, editing?.id),
    [slots, dayBookings, tableIds, duration, editing]
  );

  const hallTables = tables.filter((t) => t.hall_id === hallId && t.is_active);
  const chosen = tables.filter((t) => tableIds.includes(t.id));
  const capacity = chosen.reduce((sum, t) => sum + t.max_capacity, 0);
  const tooSmall = chosen.length > 0 && capacity < partySize;
  const slotTaken = !!startTime && taken.has(startTime);

  const hasContact = guestPhone.trim() || guestEmail.trim();
  const emailValid = guestEmail.trim().length === 0 || isValidEmail(guestEmail);
  const valid =
    guestName.trim() &&
    hasContact &&
    emailValid &&
    tableIds.length > 0 &&
    !!startTime &&
    !slotTaken &&
    // The public create endpoint rejects a party bigger than its one table;
    // an edit may knowingly squeeze in (the warning stays visible).
    (editing ? true : !tooSmall);

  const statusOptions: ReservationStatus[] = editing
    ? [editing.status, ...(ALLOWED_STATUS_TRANSITIONS[editing.status] ?? [])]
    : ["pending", "confirmed"];

  function pickTable(id: number) {
    if (editing) {
      setTableIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setTableIds([id]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailTouched(true);
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const res = await apiFetch(`/api/reservations/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            date,
            start_time: startTime,
            duration_minutes: duration,
            party_size: partySize,
            guest_name: guestName.trim(),
            guest_phone: guestPhone.trim() || null,
            guest_email: guestEmail.trim() || null,
            status,
            table_ids: tableIds,
          }),
        });
        if (!res.ok) {
          setError(await parseError(res));
          return;
        }
        onSaved(`Бронь ${guestName.trim()} сохранена`);
        return;
      }

      // Deliberately a plain fetch, not apiFetch: with the staff session
      // attached, the public create endpoint would link this booking to the
      // staff member's own account as if they were the guest.
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table_id: tableIds[0],
          date,
          start_time: startTime,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || undefined,
          guest_email: guestEmail.trim() || undefined,
          party_size: partySize,
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const created = (await res.json()) as { id: number };
      if (status === "confirmed") {
        const confirm = await apiFetch(`/api/reservations/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "confirmed" }),
        });
        if (!confirm.ok) {
          onSaved(`Бронь создана, но не подтверждена: ${await parseError(confirm)}`);
          return;
        }
      }
      onSaved(`Бронь для ${guestName.trim()} создана`);
    } catch {
      setError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = editing ? editing.guest_name : "Новая бронь";

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-[rgb(10_7_6/0.55)] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Бронь: ${title}` : title}
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[480px] flex-col border-l border-line-strong bg-surface shadow-[-40px_0_80px_-40px_#000]"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-[#2c2220] px-6 pb-4 pt-[22px]">
            <div className="min-w-0">
              <span className={CAPTION}>{editing ? `Бронь TF-${editing.id}` : "Новая бронь"}</span>
              <h2 className="mt-1 truncate font-display text-[26px] font-normal">{editing ? title : "Кого ждём?"}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-5">
            {editing && (onAccept || onRequestReject) && (
              <div className="flex gap-2.5">
                {onAccept && (
                  <button
                    type="button"
                    onClick={() => onAccept(editing)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[13px] border border-[#2f4234] bg-[#18201a] text-sm font-bold text-status-confirmed transition-colors hover:bg-[#20302a]"
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Подтвердить
                  </button>
                )}
                {onRequestReject && (
                  <button
                    type="button"
                    onClick={() => onRequestReject(editing)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[13px] border border-[#4a2a26] bg-[#221614] text-sm font-bold text-status-cancelled transition-colors hover:bg-[#2e1b18]"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Отклонить
                  </button>
                )}
              </div>
            )}

            {editing?.status === "cancelled" && editing.cancellation_reason && (
              <p className="rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
                {editing.cancelled_by === "guest" ? "Гость отменил: " : editing.cancelled_by === "host" ? "Персонал отклонил: " : "Причина: "}
                {editing.cancellation_reason}
              </p>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-[13px] font-semibold sm:col-span-2">
                Имя гостя
                <input ref={nameRef} value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} placeholder="Имя" className={INPUT} />
              </label>
              <label className="flex flex-col gap-2 text-[13px] font-semibold">
                Телефон
                <input
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                  type="tel"
                  inputMode="tel"
                  maxLength={18}
                  placeholder="+7 (7__) ___-__-__"
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13px] font-semibold">
                Email
                <input
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  type="email"
                  aria-invalid={emailTouched && !emailValid ? true : undefined}
                  className={`${INPUT} aria-invalid:border-status-cancelled`}
                />
                {emailTouched && !emailValid && <span className="text-xs font-medium text-status-cancelled">Проверьте формат email</span>}
              </label>
              {!hasContact && guestName.trim() && (
                <span className="text-xs font-medium text-[#a8958e] sm:col-span-2">Нужен телефон или email</span>
              )}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Гостей">
                <Stepper
                  value={partySize}
                  onDecrement={() => setPartySize((n) => Math.max(1, n - 1))}
                  onIncrement={() => setPartySize((n) => Math.min(100, n + 1))}
                  decrementLabel="Меньше гостей"
                  incrementLabel="Больше гостей"
                  decrementDisabled={partySize <= 1}
                  incrementDisabled={partySize >= 100}
                />
              </Field>
              <label className="flex flex-col gap-2 text-[13px] font-semibold">
                Дата
                <input
                  type="date"
                  value={date}
                  min={restaurantTodayIso()}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className={`${INPUT} h-[50px] [color-scheme:dark]`}
                />
              </label>
            </div>

            {halls.length > 1 && (
              <Field label="Зал">
                <div className="flex flex-wrap gap-2">
                  {halls.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      aria-pressed={h.id === hallId}
                      onClick={() => {
                        if (h.id === hallId) return;
                        setHallId(h.id);
                        setTableIds([]);
                      }}
                      className={`h-[38px] rounded-full border px-3.5 text-[13px] font-semibold transition-[background-color,color,border-color,transform] duration-300 ${
                        h.id === hallId ? "border-ink bg-ink text-surface" : "border-line-strong text-[#c9b6ae] hover:-translate-y-0.5 hover:border-[#8a6a62]"
                      }`}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field label={editing ? "Столы" : "Стол"}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
                {hallTables.map((t) => {
                  const on = tableIds.includes(t.id);
                  const off = t.manual_status === "out_of_service";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      disabled={off && !on}
                      onClick={() => pickTable(t.id)}
                      title={off ? "Стол не в строю" : undefined}
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-[13px] border transition-[transform,border-color,background-color] duration-300 ease-[cubic-bezier(.3,1.5,.5,1)] disabled:cursor-not-allowed disabled:opacity-40 ${
                        on ? "-translate-y-0.5 border-claret bg-claret-tint" : "border-line-strong bg-[#1a1311] enabled:hover:-translate-y-0.5 enabled:hover:border-[#8a6a62]"
                      }`}
                    >
                      <span className={`font-display text-[17px] ${on ? "text-claret" : ""}`}>{t.label}</span>
                      <small className="text-[10.5px] text-[#a8958e]">до {t.max_capacity}</small>
                    </button>
                  );
                })}
                {hallTables.length === 0 && <span className="col-span-full text-xs text-muted">В этом зале нет столов</span>}
              </div>
              {tooSmall && (
                <span role="alert" className="flex animate-[gp-up_.3s_both] items-center gap-2 text-xs font-medium text-status-pending">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                  {chosen.length > 1 ? "Столы рассчитаны" : "Стол рассчитан"} до {capacity} {pluralize(capacity, "гостя", "гостей", "гостей")}, а
                  гостей {partySize}
                  {!editing && " — выберите стол побольше"}
                </span>
              )}
            </Field>

            {editing && (
              <Field label="Длительность">
                <div className="flex flex-wrap gap-2">
                  {(DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={m === duration}
                      onClick={() => setDuration(m)}
                      className={`h-[38px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                        m === duration ? "border-ink bg-ink text-surface" : "border-line-strong text-[#c9b6ae] hover:border-[#8a6a62]"
                      }`}
                    >
                      {durationLabel(m)}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field label={`Время · бронь на ${durationLabel(duration)}`}>
              {tableIds.length === 0 && <span className="text-xs font-medium text-[#a8958e]">Сначала выберите стол — покажем свободное время</span>}
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="Время">
                {slots.map((slot) => {
                  const isTaken = taken.has(slot);
                  const on = slot === startTime;
                  return (
                    <button
                      key={slot}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={isTaken && !on}
                      aria-label={isTaken ? `${slot}, занято` : slot}
                      onClick={() => setStartTime(slot)}
                      className={`h-10 rounded-[11px] border font-mono text-[12.5px] transition-[transform,background-color,border-color,color] duration-300 ease-[cubic-bezier(.3,1.5,.5,1)] ${
                        on
                          ? isTaken
                            ? "border-status-cancelled bg-status-cancelled-tint text-status-cancelled line-through"
                            : "border-claret bg-claret text-on-accent"
                          : isTaken
                            ? "cursor-not-allowed border-line-strong bg-transparent text-[#6f5d57] line-through"
                            : "border-line-strong bg-surface-raised hover:-translate-y-0.5 hover:border-claret"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
              {slotTaken && (
                <span role="alert" className="flex animate-[gp-up_.3s_both] items-center gap-2 text-xs font-medium text-status-cancelled">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                  На это время стол уже занят — выберите другое время
                </span>
              )}
            </Field>

            {statusOptions.length > 1 && (
              <Field label="Статус">
                <Segmented
                  label="Статус"
                  options={statusOptions.map((s) => ({ value: s, label: STATUS_LABELS_RU[s] }))}
                  value={status}
                  onChange={setStatus}
                />
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2.5 border-t border-[#2c2220] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-[13px] border border-line-strong px-[18px] text-sm font-semibold text-ink/90 transition-colors hover:border-[#8a6a62] hover:bg-surface-raised"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting || !valid}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 enabled:hover:shadow-[0_14px_28px_-14px_var(--color-claret)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#2c2220] disabled:text-[#8f7c75]"
            >
              {submitting ? "Сохраняем…" : editing ? "Сохранить" : `Создать бронь · ${guestsLabel(partySize)}`}
            </button>
          </div>
        </form>
      </motion.aside>
    </>
  );
}

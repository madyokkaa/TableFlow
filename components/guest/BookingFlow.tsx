"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, parseError } from "@/lib/api";
import { candidateStartTimes, restaurantTodayIso } from "@/lib/scheduling";
import { formatDateShort, formatTime, guestsLabel } from "@/lib/ru";
import { GuestFloorPlan } from "./GuestFloorPlan";
import { DatePicker } from "./DatePicker";
import { TimeSlider } from "./TimeSlider";
import { ConfirmStep } from "./ConfirmStep";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

const STEP_LABELS = ["Стол", "Дата", "Время", "Подтверждение"];

export function BookingFlow() {
  const [step, setStep] = useState(0);
  const [partySize, setPartySize] = useState(2);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  // Restaurant-local date, not the guest's browser timezone - the server's
  // availability filter and the DB's own "no bookings in the past" check
  // both reason in the restaurant's local time too, so all three need to
  // agree on what "today" means.
  const [date, setDate] = useState(restaurantTodayIso());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [availableTimes, setAvailableTimes] = useState<Set<string> | null>(null);
  const [timesLoading, setTimesLoading] = useState(false);
  const [timesError, setTimesError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ name: string; date: string; time: string } | null>(null);

  const loadFloorPlan = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [hallsRes, tablesRes] = await Promise.all([fetch("/api/halls"), fetch("/api/tables")]);
      if (!hallsRes.ok || !tablesRes.ok) {
        setLoadError("Не удалось загрузить схему зала. Попробуйте обновить страницу.");
        return;
      }
      setHalls(await hallsRes.json());
      setTables(await tablesRes.json());
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    loadFloorPlan();
  }, [loadFloorPlan]);

  // If the guest raises party size after picking a table that no longer
  // fits, don't silently keep an invalid selection - send them back to
  // re-pick rather than letting a too-small table reach the confirm step.
  useEffect(() => {
    if (selectedTable && partySize > selectedTable.max_capacity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived invalidation, not a fetch
      setSelectedTable(null);
      setStep((s) => Math.min(s, 0));
    }
  }, [partySize, selectedTable]);

  const candidateTimes = useMemo(() => candidateStartTimes(), []);

  const timesRequestIdRef = useRef(0);
  const loadAvailableTimes = useCallback(async () => {
    if (!selectedTable) return;
    const requestId = ++timesRequestIdRef.current;
    setTimesLoading(true);
    setTimesError(null);
    setSelectedTime(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&party_size=${partySize}&table_id=${selectedTable.id}`);
      if (requestId !== timesRequestIdRef.current) return; // a newer request (e.g. the guest count changed again) superseded this one
      const body = await res.json();
      if (!res.ok) {
        setAvailableTimes(new Set());
        setTimesError(body.error ?? "Не удалось загрузить доступное время.");
        return;
      }
      setAvailableTimes(new Set((body as { start_time: string }[]).map((s) => s.start_time)));
    } catch {
      if (requestId !== timesRequestIdRef.current) return;
      setAvailableTimes(new Set());
      setTimesError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      if (requestId === timesRequestIdRef.current) setTimesLoading(false);
    }
  }, [selectedTable, date, partySize]);

  useEffect(() => {
    if (step !== 2 || !selectedTable) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    loadAvailableTimes();
  }, [step, selectedTable, loadAvailableTimes]);

  async function handleConfirm(fields: { name: string; phone: string; email: string }) {
    if (!selectedTable || !selectedTime) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          table_id: selectedTable.id,
          date,
          start_time: selectedTime,
          guest_name: fields.name,
          guest_phone: fields.phone || null,
          guest_email: fields.email || null,
          party_size: partySize,
        }),
      });
      if (!res.ok) {
        setSubmitError(await parseError(res));
        return;
      }
      setConfirmed({ name: fields.name, date, time: selectedTime });
    } catch {
      setSubmitError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div
        className="rounded-2xl border border-line bg-surface p-8 text-center"
        style={{ animation: "form-enter 220ms ease-out" }}
      >
        <p className="text-xs uppercase tracking-[0.14em] text-status-confirmed">Заявка отправлена</p>
        <p className="mt-2 font-display text-3xl text-ink text-balance">Спасибо, {confirmed.name}!</p>
        <p className="mt-2 text-sm text-muted">
          Столик на {formatDateShort(confirmed.date)} в {formatTime(confirmed.time)} ожидает подтверждения. Мы скоро с
          вами свяжемся.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmed(null);
            setStep(0);
            setSelectedTable(null);
            setSelectedTime(null);
          }}
          className="mt-5 text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Забронировать ещё
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="skeleton h-[420px] rounded-2xl border border-line" />;
  }
  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}
      </p>
    );
  }

  const canGoNext =
    (step === 0 && selectedTable !== null) || step === 1 || (step === 2 && selectedTime !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="list" aria-label="Шаги бронирования">
          {STEP_LABELS.map((label, i) => (
            <span key={label} role="listitem" title={label} className="h-1.5 w-6 overflow-hidden rounded-full bg-line">
              <span
                className={`block h-full w-full origin-left rounded-full bg-claret transition-transform duration-300 ease-out ${
                  i <= step ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </span>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Гостей</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPartySize((p) => Math.max(1, p - 1))}
              aria-label="Меньше гостей"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:border-claret"
            >
              −
            </button>
            <span className="w-6 text-center font-mono tabular-nums text-ink">{partySize}</span>
            <button
              type="button"
              onClick={() => setPartySize((p) => Math.min(20, p + 1))}
              aria-label="Больше гостей"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:border-claret"
            >
              +
            </button>
          </span>
        </label>
      </div>

      <div key={step} style={{ animation: "step-enter 220ms ease-out" }}>
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <p className="font-display text-2xl text-ink text-balance">Выберите стол</p>
            <GuestFloorPlan
              halls={halls}
              tables={tables}
              partySize={partySize}
              selectedTableId={selectedTable?.id ?? null}
              onSelectTable={setSelectedTable}
            />
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="font-display text-2xl text-ink text-balance">Выберите дату</p>
            <div className="max-w-xs">
              <DatePicker value={date} minDate={restaurantTodayIso()} onChange={setDate} />
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="font-display text-2xl text-ink text-balance">Выберите время</p>
            {timesLoading || availableTimes === null ? (
              <div className="skeleton h-16 rounded-xl border border-line" />
            ) : timesError ? (
              <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-3 text-sm text-status-cancelled">
                {timesError}
              </p>
            ) : (
              <TimeSlider
                times={candidateTimes}
                availableTimes={availableTimes}
                value={selectedTime}
                onChange={setSelectedTime}
              />
            )}
          </div>
        )}
        {step === 3 && selectedTable && selectedTime && (
          <ConfirmStep
            table={selectedTable}
            date={date}
            time={selectedTime}
            partySize={partySize}
            submitting={submitting}
            error={submitError}
            onSubmit={handleConfirm}
          />
        )}
      </div>

      {step < 3 && (
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              ← Назад
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={!canGoNext}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-claret px-6 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Далее →
          </button>
        </div>
      )}

      {step === 0 && selectedTable && (
        <p className="text-center text-xs text-muted">
          Стол {selectedTable.label} · {guestsLabel(partySize)}
        </p>
      )}
    </div>
  );
}

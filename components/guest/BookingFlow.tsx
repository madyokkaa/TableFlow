"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, parseError } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { candidateStartTimes, maxAdvanceBookingDateIso, restaurantTodayIso } from "@/lib/scheduling";
import { formatDateShort, formatTime } from "@/lib/ru";
import { GuestFloorPlan } from "./GuestFloorPlan";
import { TableRow } from "./TableRow";
import { TimeSlider } from "./TimeSlider";
import { BookingSummaryBar } from "./BookingSummaryBar";
import { ConfirmStep } from "./ConfirmStep";
import { SuccessCelebration } from "./SuccessCelebration";
import { Modal } from "@/components/Modal";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

type AvailabilitySlot = { table_id: number; start_time: string };

export function BookingFlow({ session }: { session: Session | null }) {
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(restaurantTodayIso());

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [activeHallId, setActiveHallId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ name: string; email: string; date: string; time: string } | null>(
    null
  );

  const loadFloorPlan = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [hallsRes, tablesRes] = await Promise.all([fetch("/api/halls"), fetch("/api/tables")]);
      if (!hallsRes.ok || !tablesRes.ok) {
        setLoadError("Не удалось загрузить схему зала. Попробуйте обновить страницу.");
        return;
      }
      const hallsData: Hall[] = await hallsRes.json();
      setHalls(hallsData);
      setTables(await tablesRes.json());
      setActiveHallId((current) => current ?? hallsData[0]?.id ?? null);
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

  const candidateTimes = useMemo(() => candidateStartTimes(), []);

  // One shared availability fetch per date/party-size covers every table at
  // once (the API supports omitting table_id) - both rows below read from
  // it, so picking a different table never needs a new request.
  const availabilityRequestId = useRef(0);
  const loadAvailability = useCallback(async () => {
    const requestId = ++availabilityRequestId.current;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&party_size=${partySize}`);
      if (requestId !== availabilityRequestId.current) return;
      const body = await res.json();
      if (!res.ok) {
        setAvailability([]);
        setAvailabilityError(body.error ?? "Не удалось загрузить доступное время.");
        return;
      }
      setAvailability(body as AvailabilitySlot[]);
    } catch {
      if (requestId !== availabilityRequestId.current) return;
      setAvailability([]);
      setAvailabilityError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      if (requestId === availabilityRequestId.current) setAvailabilityLoading(false);
    }
  }, [date, partySize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    loadAvailability();
  }, [loadAvailability]);

  // Date or party size changed underneath the current picks - the old time
  // is almost certainly no longer valid, and a party-size increase can also
  // invalidate the table itself, so re-derive from a clean slate rather than
  // let a stale selection reach the confirm step.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived invalidation, not a fetch
    setSelectedTime(null);
    if (selectedTable && partySize > selectedTable.max_capacity) {
      setSelectedTable(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes selectedTable so picking a table doesn't itself retrigger this
  }, [date, partySize]);

  const bookableTables = useMemo(
    () => tables.filter((t) => t.is_active && t.manual_status !== "out_of_service"),
    [tables]
  );
  const hallTables = useMemo(
    () => bookableTables.filter((t) => t.hall_id === activeHallId),
    [bookableTables, activeHallId]
  );
  const tableIdsWithAvailability = useMemo(() => new Set(availability.map((a) => a.table_id)), [availability]);
  const unavailableTableIds = useMemo(
    () => new Set(hallTables.filter((t) => !tableIdsWithAvailability.has(t.id)).map((t) => t.id)),
    [hallTables, tableIdsWithAvailability]
  );
  const timesForSelectedTable = useMemo(() => {
    if (!selectedTable) return new Set<string>();
    return new Set(availability.filter((a) => a.table_id === selectedTable.id).map((a) => a.start_time));
  }, [availability, selectedTable]);

  function handleSelectTable(table: DiningTable) {
    setSelectedTable((current) => (current?.id === table.id ? null : table));
    setSelectedTime(null);
  }

  function handleSelectTime(time: string) {
    setSelectedTime((current) => (current === time ? null : time));
  }

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
      if (session) {
        createBrowserSupabaseClient()
          .auth.updateUser({ data: { full_name: fields.name, phone: fields.phone || null } })
          .catch(() => {});
      }
      setConfirmed({ name: fields.name, email: fields.email, date, time: selectedTime });
      setConfirmOpen(false);
    } catch {
      setSubmitError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-elevated)]"
      >
        <SuccessCelebration />
        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-status-confirmed">Заявка отправлена</p>
        <p className="mt-2 font-display text-3xl text-ink text-balance">Спасибо, {confirmed.name}!</p>
        <p className="mt-2 text-sm text-muted">
          Столик на {formatDateShort(confirmed.date)} в {formatTime(confirmed.time)} ожидает подтверждения. Мы скоро с
          вами свяжемся.
        </p>

        {!session && (
          <div className="mt-6 rounded-xl border border-gold/30 bg-gold-tint px-4 py-3 text-left">
            <p className="text-sm font-medium text-ink">Сохранить эти данные?</p>
            <p className="mt-1 text-xs text-muted">
              Создайте аккаунт — в следующий раз не нужно будет вводить их заново. (Эта бронь уже отправлена как
              гостевая и останется у вас в брони по email/телефону.)
            </p>
            <a
              href={`/account/register${confirmed.email ? `?email=${encodeURIComponent(confirmed.email)}` : ""}`}
              className="mt-2 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
            >
              Создать аккаунт →
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setConfirmed(null);
            setSelectedTable(null);
            setSelectedTime(null);
          }}
          className="mt-5 text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Забронировать ещё
        </button>
      </motion.div>
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

  return (
    <div className="flex flex-col gap-8 pb-24 sm:pb-0">
      <GuestFloorPlan
        halls={halls}
        activeHallId={activeHallId}
        onHallChange={setActiveHallId}
        visibleTables={hallTables}
        partySize={partySize}
        selectedTableId={selectedTable?.id ?? null}
        unavailableTableIds={availabilityLoading ? new Set() : unavailableTableIds}
        onSelectTable={handleSelectTable}
      />

      <div className="flex flex-col gap-2.5">
        <p className="font-display text-lg text-ink">Столы</p>
        {availabilityLoading ? (
          <div className="skeleton h-12 rounded-xl border border-line" />
        ) : (
          <TableRow
            tables={hallTables}
            partySize={partySize}
            selectedTableId={selectedTable?.id ?? null}
            unavailableTableIds={unavailableTableIds}
            onSelectTable={handleSelectTable}
          />
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="font-display text-lg text-ink">Время</p>
        {availabilityError ? (
          <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-3 text-sm text-status-cancelled">
            {availabilityError}
          </p>
        ) : availabilityLoading ? (
          <div className="skeleton h-12 rounded-xl border border-line" />
        ) : (
          <TimeSlider
            hasSelectedTable={Boolean(selectedTable)}
            times={candidateTimes}
            availableTimes={timesForSelectedTable}
            value={selectedTime}
            onChange={handleSelectTime}
          />
        )}
      </div>

      <BookingSummaryBar
        date={date}
        minDate={restaurantTodayIso()}
        maxDate={maxAdvanceBookingDateIso()}
        onDateChange={setDate}
        partySize={partySize}
        onPartySizeChange={setPartySize}
        selectedTable={selectedTable}
        selectedTime={selectedTime}
        onSubmit={() => setConfirmOpen(true)}
      />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Подтверждение брони">
        {selectedTable && selectedTime && (
          <ConfirmStep
            table={selectedTable}
            date={date}
            time={selectedTime}
            partySize={partySize}
            submitting={submitting}
            error={submitError}
            onSubmit={handleConfirm}
            defaultName={(session?.user.user_metadata?.full_name as string | undefined) ?? ""}
            defaultPhone={(session?.user.user_metadata?.phone as string | undefined) ?? ""}
            defaultEmail={session?.user.email ?? ""}
          />
        )}
      </Modal>
    </div>
  );
}

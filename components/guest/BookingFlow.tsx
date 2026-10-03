"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, parseError } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { candidateStartTimes, maxAdvanceBookingDateIso, restaurantTodayIso } from "@/lib/scheduling";
import type { HallObject } from "@/lib/floorPlan";
import { GuestFloorPlan, guestTableState } from "./GuestFloorPlan";
import { TableRow } from "./TableRow";
import { BookingPanel } from "./BookingPanel";
import { ConfirmStep } from "./ConfirmStep";
import { SuccessCelebration } from "./SuccessCelebration";
import { Modal } from "@/components/Modal";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

type AvailabilitySlot = { table_id: number; start_time: string };

type Confirmed = {
  reservationId: number | null;
  name: string;
  email: string;
  date: string;
  time: string;
  partySize: number;
  tableLabel: string;
  hallName: string;
};

export function BookingFlow({ session }: { session: Session | null }) {
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(restaurantTodayIso());

  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [objectsByHall, setObjectsByHall] = useState<Map<number, HallObject[]>>(new Map());
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
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

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

  // The hall's fixed objects (bar, entrance…) are decoration for the guest -
  // fetched once per hall, and a failure just leaves the plan without them.
  useEffect(() => {
    if (activeHallId === null || objectsByHall.has(activeHallId)) return;
    const hallId = activeHallId;
    let cancelled = false;
    fetch(`/api/halls/${hallId}/objects`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((objects: HallObject[]) => {
        if (!cancelled) setObjectsByHall((prev) => new Map(prev).set(hallId, objects));
      });
    return () => {
      cancelled = true;
    };
  }, [activeHallId, objectsByHall]);

  const candidateTimes = useMemo(() => candidateStartTimes(), []);

  // One shared availability fetch per date/party-size covers every table at
  // once (the API supports omitting table_id) - the plan, chips and time
  // slots all read from it, so picking a different table never refetches.
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
  const availableTableIds = useMemo(
    () => (availabilityLoading || availabilityError ? null : new Set(availability.map((a) => a.table_id))),
    [availability, availabilityLoading, availabilityError]
  );
  const freeCountByHall = useMemo(() => {
    const counts = new Map<number, number>();
    if (!availableTableIds) return counts;
    for (const hall of halls) {
      counts.set(
        hall.id,
        bookableTables.filter((t) => t.hall_id === hall.id && guestTableState(t, partySize, null, availableTableIds) === "free")
          .length
      );
    }
    return counts;
  }, [halls, bookableTables, partySize, availableTableIds]);
  const timesForSelectedTable = useMemo(() => {
    if (!selectedTable) return new Set<string>();
    return new Set(availability.filter((a) => a.table_id === selectedTable.id).map((a) => a.start_time));
  }, [availability, selectedTable]);
  const maxPartySize = useMemo(
    () => Math.max(1, ...bookableTables.map((t) => t.max_capacity)),
    [bookableTables]
  );
  const hallName = (id: number | undefined) => halls.find((h) => h.id === id)?.name ?? "";

  function handleSelectTable(table: DiningTable) {
    setSelectedTable((current) => (current?.id === table.id ? null : table));
    setSelectedTime(null);
    if (table.hall_id !== activeHallId) setActiveHallId(table.hall_id);
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
      const created: { id?: number } = await res.json().catch(() => ({}));
      if (session) {
        createBrowserSupabaseClient()
          .auth.updateUser({ data: { full_name: fields.name, phone: fields.phone || null } })
          .catch(() => {});
      }
      setConfirmed({
        reservationId: created.id ?? null,
        name: fields.name,
        email: fields.email,
        date,
        time: selectedTime,
        partySize,
        tableLabel: selectedTable.label,
        hallName: hallName(selectedTable.hall_id),
      });
      setConfirmOpen(false);
      loadAvailability();
    } catch {
      setSubmitError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  const closeSuccess = useCallback(() => {
    setConfirmed(null);
    setSelectedTable(null);
    setSelectedTime(null);
  }, []);

  if (loading) {
    return (
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="skeleton aspect-[16/11] rounded-[22px]" />
        <div className="skeleton h-[560px] rounded-3xl" />
      </div>
    );
  }
  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}{" "}
        <button type="button" onClick={loadFloorPlan} className="underline underline-offset-4">
          Повторить
        </button>
      </p>
    );
  }

  return (
    <>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-[18px]" aria-label="Схема зала">
          <GuestFloorPlan
            halls={halls}
            activeHallId={activeHallId}
            onHallChange={setActiveHallId}
            tables={hallTables}
            objects={activeHallId !== null ? (objectsByHall.get(activeHallId) ?? []) : []}
            freeCountByHall={freeCountByHall}
            partySize={partySize}
            selectedTableId={selectedTable?.id ?? null}
            availableTableIds={availableTableIds}
            onSelectTable={handleSelectTable}
          />
          <TableRow
            tables={hallTables}
            partySize={partySize}
            selectedTableId={selectedTable?.id ?? null}
            availableTableIds={availableTableIds}
            onSelectTable={handleSelectTable}
          />
        </section>

        <BookingPanel
          date={date}
          today={restaurantTodayIso()}
          maxDate={maxAdvanceBookingDateIso()}
          onDateChange={setDate}
          partySize={partySize}
          maxPartySize={maxPartySize}
          onPartySizeChange={setPartySize}
          table={selectedTable}
          hallName={hallName(selectedTable?.hall_id)}
          onClearTable={() => {
            setSelectedTable(null);
            setSelectedTime(null);
          }}
          times={candidateTimes}
          availableTimes={timesForSelectedTable}
          availabilityLoading={availabilityLoading}
          availabilityError={availabilityError}
          time={selectedTime}
          onTimeChange={handleSelectTime}
          onSubmit={() => setConfirmOpen(true)}
        />
      </div>

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

      {confirmed && (
        <SuccessCelebration
          tableLabel={confirmed.tableLabel}
          hallName={confirmed.hallName}
          date={confirmed.date}
          time={confirmed.time}
          partySize={confirmed.partySize}
          reservationId={confirmed.reservationId}
          registerHref={
            session
              ? null
              : `/account/register${confirmed.email ? `?email=${encodeURIComponent(confirmed.email)}` : ""}`
          }
          onClose={closeSuccess}
        />
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, parseError } from "@/lib/api";
import { useReservationsReload } from "@/hooks/useReservationsRealtime";
import { restaurantTodayIso } from "@/lib/scheduling";
import type { HallObject } from "@/lib/floorPlan";
import { AdminShell } from "@/components/hostess/AdminShell";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { Hall } from "@/components/hostess/HallForm";
import { HallEditor, type TodayReservation } from "@/components/hostess/hall-editor/HallEditor";

type ReservationRow = {
  id: number;
  start_time: string;
  duration_minutes: number | null;
  guest_name: string;
  party_size: number;
  status: string;
  reservation_tables: { table_id: number }[];
};

function HallEditorContent({ hallId }: { hallId: number }) {
  const [data, setData] = useState<{ hall: Hall; tables: DiningTable[]; objects: HallObject[] } | null>(null);
  const [reservationsToday, setReservationsToday] = useState<TodayReservation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshReservationsToday = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/reservations?date=${restaurantTodayIso()}&hall_id=${hallId}`);
      if (!res.ok) return;
      const rows: ReservationRow[] = await res.json();
      setReservationsToday(
        rows.map((r) => ({
          id: r.id,
          start_time: r.start_time,
          duration_minutes: r.duration_minutes,
          guest_name: r.guest_name,
          party_size: r.party_size,
          status: r.status,
          table_ids: r.reservation_tables.map((rt) => rt.table_id),
        }))
      );
    } catch {
      // Non-fatal: the editor works without today's bookings; the next
      // realtime event retries.
    }
  }, [hallId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [hallsRes, tablesRes, objectsRes] = await Promise.all([
        fetch("/api/halls"),
        fetch(`/api/tables?hall_id=${hallId}`),
        fetch(`/api/halls/${hallId}/objects`),
      ]);
      const failed = [hallsRes, tablesRes, objectsRes].find((r) => !r.ok);
      if (failed) {
        setLoadError(await parseError(failed));
        return;
      }
      const halls: Hall[] = await hallsRes.json();
      const hall = halls.find((h) => h.id === hallId);
      if (!hall) {
        setLoadError(`Зал ${hallId} не найден`);
        return;
      }
      setData({ hall, tables: await tablesRes.json(), objects: await objectsRes.json() });
      await refreshReservationsToday();
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    }
  }, [hallId, refreshReservationsToday]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  // Today's bookings change from other tabs/devices - refresh just those,
  // never the plan itself (that would throw away in-progress edits).
  useReservationsReload(refreshReservationsToday);

  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}{" "}
        <button type="button" onClick={load} className="underline underline-offset-4">
          Повторить
        </button>
      </p>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-4 xl:grid-cols-[212px_minmax(0,1fr)_300px]">
        <div className="skeleton hidden h-[560px] rounded-[22px] xl:block" />
        <div className="skeleton h-[560px] rounded-[22px]" />
        <div className="skeleton hidden h-[560px] rounded-[22px] xl:block" />
      </div>
    );
  }

  return (
    <HallEditor
      hallId={hallId}
      initialHall={data.hall}
      initialTables={data.tables}
      initialObjects={data.objects}
      reservationsToday={reservationsToday}
    />
  );
}

export default function HallEditorPage() {
  const params = useParams<{ hallId: string }>();
  const hallId = Number(params.hallId);

  return (
    <AdminShell wide>
      {Number.isInteger(hallId) ? (
        <HallEditorContent key={hallId} hallId={hallId} />
      ) : (
        <p className="text-sm text-status-cancelled">Некорректный зал.</p>
      )}
    </AdminShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, Plus } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { useReservationsRealtime } from "@/hooks/useReservationsRealtime";
import { restaurantTodayIso } from "@/lib/scheduling";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableForm, type DiningTable } from "@/components/hostess/TableForm";
import { FloorPlanCanvas } from "@/components/hostess/FloorPlanCanvas";

type Hall = { id: number; name: string; description: string | null };

function HallTablesContent({ hallId }: { hallId: number }) {
  const [hall, setHall] = useState<Hall | null>(null);
  const [tables, setTables] = useState<DiningTable[] | null>(null);
  const [reservedTodayIds, setReservedTodayIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [deletingTable, setDeletingTable] = useState<DiningTable | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refreshReservedToday = useCallback(async () => {
    const res = await apiFetch(`/api/reservations?date=${restaurantTodayIso()}&hall_id=${hallId}`);
    if (!res.ok) {
      console.error("[halls/[hallId]] refreshReservedToday failed", res.status);
      return;
    }
    const reservations: { status: string; reservation_tables: { table_id: number }[] }[] = await res.json();
    const ids = new Set<number>();
    for (const r of reservations) {
      if (r.status === "pending" || r.status === "confirmed") {
        for (const rt of r.reservation_tables) ids.add(rt.table_id);
      }
    }
    setReservedTodayIds(ids);
  }, [hallId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [hallsRes, tablesRes] = await Promise.all([fetch("/api/halls"), fetch(`/api/tables?hall_id=${hallId}`)]);
      if (!hallsRes.ok || !tablesRes.ok) {
        setLoadError(await parseError(!hallsRes.ok ? hallsRes : tablesRes));
        return;
      }
      const halls: Hall[] = await hallsRes.json();
      const currentHall = halls.find((h) => h.id === hallId) ?? null;
      if (!currentHall) {
        setLoadError(`Зал ${hallId} не найден`);
        return;
      }
      setHall(currentHall);
      setTables(await tablesRes.json());
      await refreshReservedToday();
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }, [hallId, refreshReservedToday]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  // Today's reserved-table set can change from another tab/device (a new
  // booking, a cancellation) - refresh just that set via realtime rather
  // than reloading the hall/tables data too.
  useReservationsRealtime(
    useCallback(() => {
      refreshReservedToday();
    }, [refreshReservedToday])
  );

  async function handleCreate(fields: { label: string; shape: DiningTable["shape"]; min_capacity: number; max_capacity: number; is_active: boolean }) {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ hall_id: hallId, ...fields }) });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setCreateOpen(false);
    load();
  }

  async function handleEdit(fields: { label: string; shape: DiningTable["shape"]; min_capacity: number; max_capacity: number; is_active: boolean }) {
    if (!editingTable) return;
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch(`/api/tables/${editingTable.id}`, { method: "PATCH", body: JSON.stringify(fields) });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEditingTable(null);
    load();
  }

  async function handleManualStatus(table: DiningTable, manual_status: DiningTable["manual_status"]) {
    setFormError(null);
    const res = await apiFetch(`/api/tables/${table.id}`, { method: "PATCH", body: JSON.stringify({ manual_status }) });
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEditingTable(null);
    load();
  }

  async function handleMove(tableId: number, x: number, y: number) {
    const previous = tables;
    setTables((prev) => prev?.map((t) => (t.id === tableId ? { ...t, pos_x: x, pos_y: y } : t)) ?? prev);
    const res = await apiFetch(`/api/tables/${tableId}`, { method: "PATCH", body: JSON.stringify({ pos_x: x, pos_y: y }) });
    if (!res.ok) {
      // Roll back the optimistic move and surface the rejection (e.g. the
      // table became inactive from another tab) instead of leaving a
      // position on screen the server never accepted.
      setTables(previous);
      setLoadError(await parseError(res));
    }
  }

  async function handleDelete() {
    if (!deletingTable) return;
    const res = await apiFetch(`/api/tables/${deletingTable.id}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(await parseError(res));
    }
    setEditingTable(null);
    load();
  }

  if (loading || tables === null) {
    return <div className="skeleton h-[560px] rounded-2xl border border-line" />;
  }
  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}
      </p>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/hostess/halls"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-muted transition-colors hover:text-claret"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Залы
          </Link>
          <h1 className="mt-1 font-display text-3xl text-ink text-balance">{hall?.name}</h1>
          {hall?.description && <p className="mt-1 text-sm text-muted">{hall.description}</p>}
        </div>
        <motion.button
          type="button"
          onClick={() => setCreateOpen(true)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-claret px-4 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-claret-strong"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Новый стол
        </motion.button>
      </div>

      <p className="mb-3 text-sm text-muted">
        Перетаскивайте столы, чтобы расставить их по плану. Нажмите на стол, чтобы изменить его.
      </p>
      <FloorPlanCanvas
        tables={tables}
        reservedTodayIds={reservedTodayIds}
        onMove={handleMove}
        onSelect={(table) => setEditingTable(table)}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый стол">
        <TableForm submitting={submitting} error={formError} onSubmit={handleCreate} />
      </Modal>

      <Modal open={editingTable !== null} onClose={() => setEditingTable(null)} title={`Стол ${editingTable?.label ?? ""}`}>
        {editingTable && (
          <div className="flex flex-col gap-5">
            <TableForm initial={editingTable} submitting={submitting} error={formError} onSubmit={handleEdit} />
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Ручной статус</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, "occupied")}
                  className="rounded-lg border border-status-cancelled px-3 py-1.5 text-xs font-medium text-status-cancelled transition-colors hover:bg-status-cancelled-tint"
                >
                  Отметить занятым
                </button>
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, "out_of_service")}
                  className="rounded-lg border border-status-noshow px-3 py-1.5 text-xs font-medium text-status-noshow transition-colors hover:bg-status-noshow-tint"
                >
                  Вывести из работы
                </button>
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
                >
                  Сбросить статус
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDeletingTable(editingTable)}
              className="text-left text-sm text-status-cancelled underline decoration-status-cancelled/40 underline-offset-4 hover:brightness-90"
            >
              Удалить этот стол
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deletingTable !== null}
        onClose={() => setDeletingTable(null)}
        onConfirm={handleDelete}
        title="Удаление стола"
        message={`Удалить стол «${deletingTable?.label}»? Столы с активными бронями удалить нельзя - сначала отмените или перенесите их.`}
        confirmLabel="Удалить"
        danger
      />
    </>
  );
}

export default function HallTablesPage() {
  const params = useParams<{ hallId: string }>();
  const hallId = Number(params.hallId);

  return (
    <AdminShell>
      {Number.isInteger(hallId) ? (
        <HallTablesContent hallId={hallId} />
      ) : (
        <p className="text-sm text-status-cancelled">Некорректный зал.</p>
      )}
    </AdminShell>
  );
}

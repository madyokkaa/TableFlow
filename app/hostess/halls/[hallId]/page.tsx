"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableForm, type DiningTable } from "@/components/hostess/TableForm";
import { FloorPlanCanvas } from "@/components/hostess/FloorPlanCanvas";

type Hall = { id: number; name: string; description: string | null };

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [hallsRes, tablesRes, reservationsRes] = await Promise.all([
        fetch("/api/halls"),
        fetch(`/api/tables?hall_id=${hallId}`),
        apiFetch(`/api/reservations?date=${todayIso()}&hall_id=${hallId}`),
      ]);
      if (!hallsRes.ok || !tablesRes.ok) {
        setLoadError(await parseError(!hallsRes.ok ? hallsRes : tablesRes));
        return;
      }
      const halls: Hall[] = await hallsRes.json();
      const currentHall = halls.find((h) => h.id === hallId) ?? null;
      if (!currentHall) {
        setLoadError(`Hall ${hallId} not found`);
        return;
      }
      setHall(currentHall);
      setTables(await tablesRes.json());

      if (reservationsRes.ok) {
        const reservations: { status: string; reservation_tables: { table_id: number }[] }[] = await reservationsRes.json();
        const ids = new Set<number>();
        for (const r of reservations) {
          if (r.status === "pending" || r.status === "confirmed") {
            for (const rt of r.reservation_tables) ids.add(rt.table_id);
          }
        }
        setReservedTodayIds(ids);
      }
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [hallId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

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
          <Link href="/hostess/halls" className="text-xs uppercase tracking-[0.14em] text-muted hover:text-claret">
            ← Halls
          </Link>
          <h1 className="mt-1 font-display text-3xl text-ink text-balance">{hall?.name}</h1>
          {hall?.description && <p className="mt-1 text-sm text-muted">{hall.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-claret px-4 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98]"
        >
          + New table
        </button>
      </div>

      <p className="mb-3 text-sm text-muted">Drag tables to arrange the floor plan. Click a table to edit it.</p>
      <FloorPlanCanvas
        tables={tables}
        reservedTodayIds={reservedTodayIds}
        onMove={handleMove}
        onSelect={(table) => setEditingTable(table)}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New table">
        <TableForm submitting={submitting} error={formError} onSubmit={handleCreate} />
      </Modal>

      <Modal open={editingTable !== null} onClose={() => setEditingTable(null)} title={`Table ${editingTable?.label ?? ""}`}>
        {editingTable && (
          <div className="flex flex-col gap-5">
            <TableForm initial={editingTable} submitting={submitting} error={formError} onSubmit={handleEdit} />
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Manual override</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, "occupied")}
                  className="rounded-lg border border-status-cancelled px-3 py-1.5 text-xs font-medium text-status-cancelled transition-colors hover:bg-status-cancelled-tint"
                >
                  Mark occupied
                </button>
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, "out_of_service")}
                  className="rounded-lg border border-status-noshow px-3 py-1.5 text-xs font-medium text-status-noshow transition-colors hover:bg-status-noshow-tint"
                >
                  Mark out of service
                </button>
                <button
                  type="button"
                  onClick={() => handleManualStatus(editingTable, null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
                >
                  Clear override
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDeletingTable(editingTable)}
              className="text-left text-sm text-status-cancelled underline decoration-status-cancelled/40 underline-offset-4 hover:brightness-90"
            >
              Delete this table
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deletingTable !== null}
        onClose={() => setDeletingTable(null)}
        onConfirm={handleDelete}
        title="Delete table"
        message={`Delete table "${deletingTable?.label}"? Tables with active reservations can't be deleted - cancel or move them first.`}
        confirmLabel="Delete"
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
        <p className="text-sm text-status-cancelled">Invalid hall.</p>
      )}
    </AdminShell>
  );
}

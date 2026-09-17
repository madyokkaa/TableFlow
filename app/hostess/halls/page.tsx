"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Plus, ArrowRight } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HallForm, type Hall } from "@/components/hostess/HallForm";

function HallsPageContent() {
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [deletingHall, setDeletingHall] = useState<Hall | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/halls");
      if (!res.ok) {
        setLoadError(await parseError(res));
        setHalls([]);
        return;
      }
      setHalls(await res.json());
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
      setHalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  async function handleCreate(fields: { name: string; description: string }) {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch("/api/halls", {
      method: "POST",
      body: JSON.stringify({ name: fields.name, description: fields.description || null }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setCreateOpen(false);
    load();
  }

  async function handleEdit(fields: { name: string; description: string }) {
    if (!editingHall) return;
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch(`/api/halls/${editingHall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: fields.name, description: fields.description || null }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEditingHall(null);
    load();
  }

  async function handleDelete() {
    if (!deletingHall) return;
    const res = await apiFetch(`/api/halls/${deletingHall.id}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(await parseError(res));
    }
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink text-balance">Залы</h1>
        <motion.button
          type="button"
          onClick={() => setCreateOpen(true)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-claret px-4 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-claret-strong"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Новый зал
        </motion.button>
      </div>

      {loading || halls === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl border border-line" />
          ))}
        </div>
      ) : loadError ? (
        <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
          {loadError}
        </p>
      ) : halls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          Пока нет ни одного зала. Создайте зал, чтобы добавлять столы.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
            >
              <div>
                <Link href={`/hostess/halls/${hall.id}`} className="font-display text-lg text-ink hover:text-claret">
                  {hall.name}
                </Link>
                {hall.description && <p className="mt-1 text-sm text-muted">{hall.description}</p>}
              </div>
              <div className="mt-auto flex items-center gap-4 pt-2 text-sm">
                <Link
                  href={`/hostess/halls/${hall.id}`}
                  className="flex items-center gap-1 text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
                >
                  Управлять столами
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => setEditingHall(hall)}
                  className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
                >
                  Изменить
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingHall(hall)}
                  className="text-status-cancelled underline decoration-status-cancelled/40 underline-offset-4 hover:brightness-90"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый зал">
        <HallForm submitting={submitting} error={formError} onSubmit={handleCreate} />
      </Modal>

      <Modal open={editingHall !== null} onClose={() => setEditingHall(null)} title="Изменить зал">
        {editingHall && <HallForm initial={editingHall} submitting={submitting} error={formError} onSubmit={handleEdit} />}
      </Modal>

      <ConfirmDialog
        open={deletingHall !== null}
        onClose={() => setDeletingHall(null)}
        onConfirm={handleDelete}
        title="Удаление зала"
        message={`Удалить зал «${deletingHall?.name}»? Это действие нельзя отменить. Залы со столами удалить нельзя - сначала удалите столы.`}
        confirmLabel="Удалить"
        danger
      />
    </>
  );
}

export default function HallsPage() {
  return (
    <AdminShell>
      <HallsPageContent />
    </AdminShell>
  );
}

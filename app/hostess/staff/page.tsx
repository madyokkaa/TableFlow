"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { formatDateLong } from "@/lib/ru";
import { AdminShell } from "@/components/hostess/AdminShell";
import { Modal } from "@/components/Modal";

type StaffMember = {
  user_id: string;
  email: string | null;
  active: boolean;
  created_at: string;
};

function AddStaffForm({
  submitting,
  error,
  onSubmit,
}: {
  submitting: boolean;
  error: string | null;
  onSubmit: (fields: { email: string; password: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const valid = email.trim().length > 0 && password.length >= 8;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ email: email.trim(), password });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="admin@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Пароль</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
        />
        <span className="text-xs text-muted">
          Не короче 8 символов. Если email уже привязан к аккаунту, пароль не потребуется — мы отправим ссылку для
          восстановления на почту.
        </span>
      </label>
      {error && <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !valid}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Добавляем…" : "Добавить админа"}
      </button>
    </form>
  );
}

function StaffPageContent() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch("/api/staff");
      if (!res.ok) {
        setLoadError(await parseError(res));
        setStaff([]);
        return;
      }
      setStaff(await res.json());
    } catch {
      setLoadError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  async function handleCreate(fields: { email: string; password: string }) {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiFetch("/api/staff", { method: "POST", body: JSON.stringify(fields) });
      if (!res.ok) {
        setFormError(await parseError(res));
        return;
      }
      const created: { promoted: boolean } = await res.json();
      setCreateOpen(false);
      setSuccessNote(
        created.promoted
          ? "Этот email уже был зарегистрирован - доступ выдан, на почту отправлена ссылка для восстановления пароля."
          : "Новый админ добавлен."
      );
      load();
    } catch {
      setFormError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink text-balance">Сотрудники</h1>
        <motion.button
          type="button"
          onClick={() => {
            setFormError(null);
            setCreateOpen(true);
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-claret px-4 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-claret-strong"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Добавить админа
        </motion.button>
      </div>

      {successNote && (
        <p className="mb-4 rounded-xl border border-status-confirmed/40 bg-status-confirmed-tint px-4 py-3 text-sm text-status-confirmed">
          {successNote}
        </p>
      )}

      {loading || staff === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl border border-line" />
          ))}
        </div>
      ) : loadError ? (
        <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {staff.map((member) => (
            <div
              key={member.user_id}
              className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-paper/60"
            >
              <div className="min-w-[200px] flex-1 text-sm font-medium text-ink">{member.email ?? "—"}</div>
              <div className="text-xs text-muted">С {formatDateLong(member.created_at.slice(0, 10))}</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  member.active
                    ? "bg-status-confirmed-tint text-status-confirmed"
                    : "bg-status-noshow-tint text-status-noshow"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {member.active ? "Активен" : "Отключён"}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый админ">
        <AddStaffForm submitting={submitting} error={formError} onSubmit={handleCreate} />
      </Modal>
    </>
  );
}

export default function StaffPage() {
  return (
    <AdminShell>
      <StaffPageContent />
    </AdminShell>
  );
}

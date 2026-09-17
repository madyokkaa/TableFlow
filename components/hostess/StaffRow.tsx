"use client";

import { useState, type FormEvent } from "react";
import { Mail, KeyRound, UserX } from "lucide-react";
import { motion } from "motion/react";
import { apiFetch, parseError } from "@/lib/api";
import { formatDateLong } from "@/lib/ru";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export type StaffMember = { user_id: string; email: string | null; active: boolean; created_at: string };

const ICON_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-paper hover:text-ink active:scale-90";

function EditEmailForm({
  initialEmail,
  submitting,
  error,
  onSubmit,
}: {
  initialEmail: string | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const valid = email.trim().length > 0 && email !== initialEmail;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit(email.trim());
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
        />
      </label>
      {error && <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !valid}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Сохраняем…" : "Сохранить email"}
      </button>
    </form>
  );
}

export function StaffRow({ member, isSelf, onChanged }: { member: StaffMember; isSelf: boolean; onChanged: () => void }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleEmailSubmit(email: string) {
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch(`/api/staff/${member.user_id}`, { method: "PATCH", body: JSON.stringify({ email }) });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(await parseError(res));
      return;
    }
    setEmailOpen(false);
    onChanged();
  }

  async function handleResetPassword() {
    setNote(null);
    const res = await apiFetch(`/api/staff/${member.user_id}/reset-password`, { method: "POST" });
    setNote(res.ok ? "Ссылка для сброса пароля отправлена." : await parseError(res));
  }

  async function handleDeactivate() {
    const res = await apiFetch(`/api/staff/${member.user_id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-paper/60">
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-medium text-ink">{member.email ?? "—"}</p>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      <div className="text-xs text-muted">С {formatDateLong(member.created_at.slice(0, 10))}</div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          member.active ? "bg-status-confirmed-tint text-status-confirmed" : "bg-status-noshow-tint text-status-noshow"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {member.active ? "Активен" : "Отключён"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <motion.button
          type="button"
          title="Изменить email"
          onClick={() => setEmailOpen(true)}
          whileTap={{ scale: 0.9 }}
          className={ICON_BUTTON}
        >
          <Mail className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </motion.button>
        <motion.button
          type="button"
          title="Сбросить пароль"
          onClick={handleResetPassword}
          whileTap={{ scale: 0.9 }}
          className={ICON_BUTTON}
        >
          <KeyRound className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </motion.button>
        {!isSelf && member.active && (
          <motion.button
            type="button"
            title="Отключить доступ"
            onClick={() => setDeactivateOpen(true)}
            whileTap={{ scale: 0.9 }}
            className={`${ICON_BUTTON} hover:bg-status-cancelled-tint hover:text-status-cancelled`}
          >
            <UserX className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </motion.button>
        )}
      </div>

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Изменить email">
        <EditEmailForm initialEmail={member.email} submitting={submitting} error={formError} onSubmit={handleEmailSubmit} />
      </Modal>

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={handleDeactivate}
        title="Отключение доступа"
        message={`Отключить доступ для «${member.email}»? Он больше не сможет войти в панель персонала. Доступ можно будет вернуть, повторно пригласив этот email.`}
        confirmLabel="Отключить"
        danger
      />
    </div>
  );
}

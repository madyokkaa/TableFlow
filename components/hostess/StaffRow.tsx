"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { formatDateLong } from "@/lib/ru";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { INPUT } from "./hall-editor/controls";

export type StaffMember = { user_id: string; email: string | null; active: boolean; created_at: string };

const ICON_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-[10px] text-muted transition-[background-color,color,transform] duration-200 hover:bg-[#2a201d] hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-40";

/** Hover/focus tooltip above a control - the label is also its aria-label. */
function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group/tip relative flex">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[7px] bg-ink px-2 py-[5px] text-[11px] font-semibold text-surface opacity-0 transition-[opacity,transform] duration-200 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100 group-hover/tip:translate-y-0 group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

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
      <label className="flex flex-col gap-2 text-[13px] font-semibold">
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" className={INPUT} />
      </label>
      {error && (
        <p role="alert" className="rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !valid}
        className="inline-flex h-11 items-center justify-center rounded-[13px] bg-claret px-5 text-sm font-bold text-on-accent transition-transform duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Сохраняем…" : "Сохранить email"}
      </button>
    </form>
  );
}

/** One staff account: avatar with an online dot, email and since-date,
 * status pill, access switch (not for yourself), edit email and send a
 * password-reset link, remove from staff. Access changes and removal are
 * reported back to the page, which owns those requests and their toasts. */
export function StaffRow({
  member,
  isSelf,
  busy,
  index,
  onToggleAccess,
  onRemove,
  onChanged,
  notify,
}: {
  member: StaffMember;
  isSelf: boolean;
  busy: boolean;
  index: number;
  onToggleAccess: (member: StaffMember) => void;
  onRemove: (member: StaffMember) => Promise<void>;
  onChanged: () => void;
  notify: (message: string, tone?: "ok" | "error") => void;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

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
    notify(`Email изменён на ${email}`);
    onChanged();
  }

  async function handleResetPassword() {
    setResetting(true);
    try {
      const res = await apiFetch(`/api/staff/${member.user_id}/reset-password`, { method: "POST" });
      if (res.ok) notify(`Ссылка для сброса пароля отправлена на ${member.email ?? "почту сотрудника"}`);
      else notify(await parseError(res), "error");
    } catch {
      notify("Не удалось связаться с сервером", "error");
    } finally {
      setResetting(false);
    }
  }

  const initial = (member.email ?? "?").charAt(0).toUpperCase();
  const pill = isSelf
    ? { label: "Это вы", cls: "bg-claret-tint text-claret" }
    : member.active
      ? { label: "Активен", cls: "bg-status-confirmed-tint text-status-confirmed" }
      : { label: "Отключён", cls: "bg-[#231d1b] text-[#a8958e]" };
  const switchTip = isSelf ? "Это вы" : member.active ? "Отключить доступ" : "Включить доступ";

  return (
    <div
      className="grid animate-[gp-up_.5s_both] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-[#2a201d] px-4 py-3.5 transition-colors duration-200 last:border-b-0 hover:bg-surface-raised sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-5"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span
        className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] font-display text-lg after:absolute after:-bottom-0.5 after:-right-0.5 after:h-[11px] after:w-[11px] after:rounded-full after:shadow-[0_0_0_3px_#1a1412] ${
          member.active ? "bg-claret-tint text-claret after:bg-status-confirmed" : "bg-[#2a201d] text-[#8f7c75] after:bg-[#5a4a45]"
        }`}
        aria-hidden="true"
      >
        {initial}
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <b className="truncate text-sm">{member.email ?? "—"}</b>
        <small className="text-xs text-muted">с {formatDateLong(member.created_at.slice(0, 10))}</small>
      </div>
      <span
        className={`hidden h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:bg-current sm:inline-flex ${pill.cls}`}
      >
        {pill.label}
      </span>
      <div className="flex items-center gap-1">
        <Tip text={switchTip}>
          <button
            type="button"
            role="switch"
            aria-checked={member.active}
            aria-label={`Доступ: ${member.email ?? "сотрудник"}`}
            disabled={isSelf || busy}
            onClick={() => onToggleAccess(member)}
            className="flex min-h-11 items-center px-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-300 ${member.active ? "bg-claret" : "bg-line-strong"}`}>
              <span
                className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-ink transition-transform duration-[400ms] ease-[cubic-bezier(.3,1.6,.5,1)] ${
                  member.active ? "translate-x-4" : ""
                }`}
              />
            </span>
          </button>
        </Tip>
        <Tip text="Изменить email">
          <button type="button" aria-label="Изменить email" onClick={() => setEmailOpen(true)} className={ICON_BUTTON}>
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </button>
        </Tip>
        <Tip text="Сбросить пароль — письмо со ссылкой">
          <button type="button" aria-label="Сбросить пароль" disabled={resetting} onClick={handleResetPassword} className={ICON_BUTTON}>
            <KeyRound className="h-4 w-4" strokeWidth={2} />
          </button>
        </Tip>
        {!isSelf && (
          <Tip text="Удалить сотрудника">
            <button
              type="button"
              aria-label={`Удалить сотрудника ${member.email ?? ""}`}
              disabled={busy}
              onClick={() => setRemoveOpen(true)}
              className={`${ICON_BUTTON} hover:bg-status-cancelled-tint hover:text-status-cancelled`}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
            </button>
          </Tip>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => onRemove(member)}
        title="Удаление сотрудника"
        message={`Удалить «${member.email ?? "сотрудника"}» из персонала? Он сразу потеряет доступ к панели и исчезнет из списка. Его гостевой аккаунт и брони останутся — при необходимости его можно пригласить снова.`}
        confirmLabel="Удалить"
        danger
      />

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Изменить email">
        <EditEmailForm initialEmail={member.email} submitting={submitting} error={formError} onSubmit={handleEmailSubmit} />
      </Modal>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "@/lib/passwordStrength";
import { AdminShell } from "@/components/hostess/AdminShell";
import { ChangePasswordCard, PasswordStrengthMeter } from "@/components/hostess/ChangePasswordCard";
import { StaffRow, type StaffMember } from "@/components/hostess/StaffRow";
import { Toaster, useToast } from "@/components/hostess/Toast";
import { INPUT } from "@/components/hostess/hall-editor/controls";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NETWORK_ERROR = "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.";

/** POST /api/staff requires a password even though it only uses it for a
 * brand-new account - an existing account (which every deactivated staff
 * member is) is re-granted access and emailed a reset link instead. So
 * turning access back on sends a throwaway random value that is never
 * stored anywhere. */
function throwawayPassword() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.slice(0, 48);
}

/** The inline "add a staff member" row at the top of the list. A brand-new
 * email gets an account with this temporary password (passed on to the
 * person directly); an email that already has an account is granted access
 * and emailed a link to set their own password - see POST /api/staff. */
function InviteRow({ onInvited }: { onInvited: (email: string, promoted: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim()) && passwordStrength(password) >= 1;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/staff", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const created: { promoted: boolean } = await res.json();
      onInvited(email.trim(), created.promoted);
      setEmail("");
      setPassword("");
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1.2] }}
      className="overflow-hidden border-b border-[#2a201d] bg-surface-raised"
      aria-label="Новый сотрудник"
    >
      <div className="grid items-start gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-2 text-[13px] font-semibold">
          Email сотрудника
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="off"
            placeholder="hostess@restoran.kz"
            className={INPUT}
            autoFocus
          />
          <span className="text-xs font-medium text-muted">Если email уже зарегистрирован, пароль не понадобится — пришлём ссылку.</span>
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-semibold">
          Временный пароль
          <span className="relative">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={shown ? "text" : "password"}
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={72}
              autoComplete="new-password"
              aria-describedby="invite-password-strength"
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={shown}
              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
            >
              {shown ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
            </button>
          </span>
          <PasswordStrengthMeter password={password} id="invite-password-strength" />
        </label>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 enabled:hover:shadow-[0_14px_28px_-14px_var(--color-claret)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#2c2220] disabled:text-[#8f7c75] lg:mt-[29px]"
        >
          {submitting ? "Приглашаем…" : "Пригласить"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mx-4 mb-4 rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled sm:mx-5">
          {error}
        </p>
      )}
    </motion.form>
  );
}

function StaffPageContent() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const { toast, show, dismiss } = useToast();

  useEffect(() => {
    createBrowserSupabaseClient()
      .auth.getSession()
      .then(({ data }) => setMyUserId(data.session?.user.id ?? null));
  }, []);

  const load = useCallback(async () => {
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
      setLoadError(NETWORK_ERROR);
      setStaff([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => show(message, { tone }), [show]);

  function setActive(userId: string, active: boolean) {
    setStaff((prev) => prev?.map((m) => (m.user_id === userId ? { ...m, active } : m)) ?? prev);
  }

  function markBusy(userId: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  async function disable(member: StaffMember) {
    setActive(member.user_id, false);
    markBusy(member.user_id, true);
    try {
      const res = await apiFetch(`/api/staff/${member.user_id}`, { method: "DELETE" });
      if (!res.ok) {
        setActive(member.user_id, true);
        notify(await parseError(res), "error");
        return;
      }
      show(`${member.email ?? "Сотрудник"} — доступ отключён`, { action: { label: "Вернуть", run: () => enable(member) } });
    } catch {
      setActive(member.user_id, true);
      notify(NETWORK_ERROR, "error");
    } finally {
      markBusy(member.user_id, false);
    }
  }

  async function enable(member: StaffMember) {
    if (!member.email) {
      notify("У этого аккаунта нет email — доступ не вернуть отсюда", "error");
      return;
    }
    setActive(member.user_id, true);
    markBusy(member.user_id, true);
    try {
      const res = await apiFetch("/api/staff", {
        method: "POST",
        body: JSON.stringify({ email: member.email, password: throwawayPassword() }),
      });
      if (!res.ok) {
        setActive(member.user_id, false);
        notify(await parseError(res), "error");
        return;
      }
      notify(`${member.email} — доступ включён, на почту отправлена ссылка для входа`);
    } catch {
      setActive(member.user_id, false);
      notify(NETWORK_ERROR, "error");
    } finally {
      markBusy(member.user_id, false);
    }
  }

  function handleInvited(email: string, promoted: boolean) {
    setInviteOpen(false);
    notify(
      promoted
        ? `${email} уже был зарегистрирован — доступ выдан, ссылка для пароля отправлена на почту`
        : `Сотрудник ${email} добавлен — передайте ему временный пароль`
    );
    load();
  }

  const activeCount = staff?.filter((m) => m.active).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em]">Сотрудники</h1>
          {staff && staff.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              Активны {activeCount} из {staff.length}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen((v) => !v)}
          aria-expanded={inviteOpen}
          className="group inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 hover:shadow-[0_14px_28px_-14px_var(--color-claret)] active:scale-[0.98]"
        >
          <Plus
            className={`h-4 w-4 transition-transform duration-300 ${inviteOpen ? "rotate-45" : "group-hover:rotate-90"}`}
            strokeWidth={2.4}
            aria-hidden="true"
          />
          {inviteOpen ? "Закрыть" : "Добавить сотрудника"}
        </button>
      </div>

      <ChangePasswordCard onChanged={notify} />

      <section aria-label="Список сотрудников" className="overflow-hidden rounded-[22px] border border-line bg-[#1a1412]">
        <AnimatePresence initial={false}>{inviteOpen && <InviteRow key="invite" onInvited={handleInvited} />}</AnimatePresence>
        {staff === null ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <p role="alert" className="px-4 py-8 text-center text-sm text-status-cancelled">
            {loadError}
          </p>
        ) : staff.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Пока никого. Пригласите первого сотрудника.</p>
        ) : (
          staff.map((member, i) => (
            <StaffRow
              key={member.user_id}
              member={member}
              index={i}
              isSelf={member.user_id === myUserId}
              busy={busyIds.has(member.user_id)}
              onToggleAccess={(m) => (m.active ? disable(m) : enable(m))}
              onChanged={load}
              notify={notify}
            />
          ))
        )}
      </section>

      <Toaster toast={toast} onDismiss={dismiss} />
    </div>
  );
}

export default function StaffPage() {
  return (
    <AdminShell>
      <StaffPageContent />
    </AdminShell>
  );
}

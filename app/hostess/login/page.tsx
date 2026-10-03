"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowBigUp, ArrowRight, Check, KeyRound, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { pluralize } from "@/lib/ru";
import { markStaffDevice } from "@/lib/staffDevice";
import { AuthField, AuthSubmit, PasswordField } from "@/components/guest/AuthCard";
import { StaffAuthShell, StaffOverlay } from "@/components/hostess/StaffAuthShell";
import { StaffForgotForm } from "@/components/hostess/StaffForgotForm";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function HostessLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // undefined while the shift isn't open; null once open but the pending
  // count is unknown (fetch failed or not staff).
  const [pending, setPending] = useState<number | null | undefined>(undefined);
  const openPanelRef = useRef<HTMLButtonElement>(null);
  const redirectTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);
  useEffect(() => {
    if (pending !== undefined) openPanelRef.current?.focus();
  }, [pending]);

  function checkCaps(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  function openPanel() {
    router.replace("/hostess");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      // Supabase deliberately returns the same "invalid credentials" error
      // for a wrong password and a nonexistent email (prevents an attacker
      // from using the login form to enumerate valid staff emails) - so we
      // show one generic message for both rather than guessing which it was.
      if (!error.message.toLowerCase().includes("invalid")) {
        console.error("[hostess/login] signInWithPassword failed", error);
      }
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "Неверный email или пароль. Проверьте раскладку и Caps Lock."
          : "Не удалось войти. Проверьте соединение и попробуйте ещё раз."
      );
      setShakes((n) => n + 1);
      return;
    }
    markStaffDevice(remember);
    let count: number | null = null;
    try {
      const res = await apiFetch("/api/reservations?status=pending");
      if (res.ok) count = ((await res.json()) as unknown[]).length;
    } catch {
      // The count is a nicety on the welcome screen - skip it.
    }
    setSubmitting(false);
    setPending(count);
    redirectTimer.current = window.setTimeout(openPanel, 3500);
  }

  const invalid = error ? true : undefined;
  const ready = EMAIL_RE.test(email.trim()) && password.length > 0;

  const overlay =
    pending !== undefined ? (
      <StaffOverlay check title="Смена открыта">
        <p className="text-sm text-muted">
          Все столы на месте
          {pending
            ? `, ${pluralize(pending, "ждёт", "ждут", "ждут")} подтверждения ${pending} ${pluralize(pending, "бронь", "брони", "броней")}.`
            : "."}
        </p>
        <button
          ref={openPanelRef}
          type="button"
          onClick={openPanel}
          className="group flex h-[54px] items-center justify-center gap-2.5 rounded-[15px] bg-claret text-[15px] font-bold text-on-accent transition-[transform,box-shadow] duration-200 hover:shadow-[0_16px_34px_-16px_var(--color-claret)] active:scale-[0.98]"
        >
          Открыть панель
          <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </StaffOverlay>
    ) : forgotOpen ? (
      <StaffOverlay title="Сброс пароля">
        <StaffForgotForm initialEmail={email} onBack={() => setForgotOpen(false)} />
      </StaffOverlay>
    ) : null;

  return (
    <StaffAuthShell
      title="Вход для персонала"
      subtitle="Откройте смену, чтобы управлять бронями и залом."
      open={pending !== undefined}
      shake={shakes}
      overlay={overlay}
    >
      {error && (
        <div
          key={shakes}
          role="alert"
          className="flex animate-[gp-up_.35s_both] items-center gap-2.5 rounded-[13px] border border-[#4a2a26] bg-[#2a1816] px-3.5 py-[11px] text-[13px] text-[#f0a597]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <AuthField
          label="Рабочий email"
          icon={<Mail className="h-[17px] w-[17px]" strokeWidth={2} />}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          onKeyUp={checkCaps}
          type="email"
          required
          autoComplete="username"
          placeholder="hostess@restoran.kz"
          aria-invalid={invalid}
        />
        <PasswordField
          label="Пароль"
          icon={<KeyRound className="h-[17px] w-[17px]" strokeWidth={2} />}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          onKeyUp={checkCaps}
          onKeyDown={checkCaps}
          required
          autoComplete="current-password"
          aria-invalid={invalid}
          hint={
            capsLock ? (
              <span className="inline-flex animate-[gp-up_.3s_both] items-center gap-1.5 text-status-pending">
                <ArrowBigUp className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                Включён Caps Lock
              </span>
            ) : undefined
          }
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={remember}
          onClick={() => setRemember((v) => !v)}
          className="flex min-h-10 items-center gap-2.5 self-start text-[13px] text-[#c9b6ae]"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] transition-colors duration-300 ${
              remember ? "border-claret bg-claret text-on-accent" : "border-[#4a3833]"
            }`}
          >
            <Check
              className={`h-3 w-3 transition-[opacity,transform] duration-300 ease-[cubic-bezier(.3,1.7,.5,1)] ${remember ? "scale-100 opacity-100" : "scale-[.4] opacity-0"}`}
              strokeWidth={3.5}
              aria-hidden="true"
            />
          </span>
          Запомнить это устройство на смену
        </button>
        <AuthSubmit busy={submitting} disabled={!ready} busyText="Открываем смену…">
          Войти
        </AuthSubmit>
      </form>
      <button
        type="button"
        onClick={() => setForgotOpen(true)}
        className="inline-flex min-h-10 items-center self-center text-[13px] font-semibold text-muted underline decoration-muted/35 underline-offset-4 transition-colors hover:text-ink"
      >
        Забыли пароль?
      </button>
    </StaffAuthShell>
  );
}

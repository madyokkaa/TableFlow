"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, STRENGTH_LABELS, passwordStrength } from "@/lib/passwordStrength";
import { INPUT } from "./hall-editor/controls";

const BAR_COLOR = ["", "bg-status-cancelled", "bg-status-pending", "bg-status-confirmed", "bg-status-confirmed"];

/** Four bars that fill and colour with `passwordStrength`, plus its label. */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const score = passwordStrength(password);
  return (
    <>
      <span className="mt-1 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <i
            key={bar}
            className={`block h-1 rounded transition-[background-color,transform] duration-[400ms] ease-[cubic-bezier(.3,1.6,.5,1)] ${
              score >= bar ? `${BAR_COLOR[score]} scale-y-[1.6]` : "bg-[#2c2220]"
            }`}
          />
        ))}
      </span>
      <span id={id} aria-live="polite" className="text-xs font-medium text-muted">
        {score === 0 ? STRENGTH_LABELS[0] : `Надёжность: ${STRENGTH_LABELS[score].toLowerCase()}`}
      </span>
    </>
  );
}

/** Self-service password change - goes straight to the browser Supabase
 * client (`auth.updateUser`), not a custom API route: a signed-in user is
 * always allowed to change their own password, and this is exactly what
 * that call is for. No admin privileges or target-user lookup involved. */
export function ChangePasswordCard({ onChanged }: { onChanged?: (message: string, tone?: "ok" | "error") => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = passwordStrength(password);
  const match = confirm.length > 0 && password === confirm;
  const valid = score >= 2 && match;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      onChanged?.("Не удалось сменить пароль", "error");
      return;
    }
    setPassword("");
    setConfirm("");
    onChanged?.("Пароль обновлён");
  }

  return (
    <section className="flex animate-[gp-up_.6s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-4 rounded-[22px] border border-line bg-surface p-[22px]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-claret-tint text-claret" aria-hidden="true">
          <Lock className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-display text-[19px] font-normal">Мой пароль</h2>
          <span className="text-xs text-muted">Минимум {MIN_PASSWORD_LENGTH} символов, лучше с цифрой и заглавной буквой</span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-2 text-[13px] font-semibold">
          Новый пароль
          <span className="relative">
            <input
              type={shown ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              aria-describedby="my-password-strength"
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
          <PasswordStrengthMeter password={password} id="my-password-strength" />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-semibold">
          Повторите пароль
          <input
            type={shown ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            aria-describedby="my-password-match"
            className={INPUT}
          />
          <span
            id="my-password-match"
            aria-live="polite"
            className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${match ? "text-status-confirmed" : "text-[#a8958e]"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" strokeDasharray="30" strokeDashoffset={match ? 0 : 30} className="transition-[stroke-dashoffset] duration-500" />
            </svg>
            {confirm.length === 0 ? "Повторите, чтобы проверить" : match ? "Пароли совпадают" : "Пока не совпадает"}
          </span>
        </label>
        <button
          type="submit"
          disabled={submitting || !valid}
          className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 enabled:hover:shadow-[0_14px_28px_-14px_var(--color-claret)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#2c2220] disabled:text-[#8f7c75] lg:mt-[29px]"
        >
          {submitting ? "Сохраняем…" : "Сменить пароль"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-status-cancelled">
          {error}
        </p>
      )}
    </section>
  );
}

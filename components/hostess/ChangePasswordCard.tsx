"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** Self-service password change - goes straight to the browser Supabase
 * client (`auth.updateUser`), not a custom API route: a signed-in user is
 * always allowed to change their own password, and this is exactly what
 * that call is for. No admin privileges or target-user lookup involved. */
export function ChangePasswordCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = password.length > 0 && confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg text-ink">Мой пароль</h2>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Новый пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Повторите пароль</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !valid}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-claret px-4 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Сохраняем…" : "Сменить пароль"}
        </button>
      </form>
      {mismatch && <p className="mt-2 text-xs text-status-cancelled">Пароли не совпадают</p>}
      {password.length > 0 && password.length < 8 && (
        <p className="mt-2 text-xs text-status-cancelled">Не короче 8 символов</p>
      )}
      {error && <p className="mt-2 text-xs text-status-cancelled">{error}</p>}
      {success && <p className="mt-2 text-xs text-status-confirmed">Пароль изменён.</p>}
    </div>
  );
}

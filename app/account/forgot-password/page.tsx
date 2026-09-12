"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/guest/AuthCard";

export default function GuestForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/reset-password`,
    });
    setSending(false);
    // Always the same outcome regardless of whether the email has an
    // account - same anti-enumeration reasoning as the hostess flow.
    if (error) {
      console.error("[account/forgot-password] resetPasswordForEmail failed", error);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Проверьте почту">
        <p className="text-sm text-muted">
          Если у <span className="text-ink">{email}</span> есть аккаунт, мы отправили на него ссылку для смены
          пароля.
        </p>
        <a
          href="/account/login"
          className="mt-5 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Назад ко входу
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Восстановление пароля" subtitle="Отправим ссылку для установки нового пароля.">
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
        <button
          type="submit"
          disabled={sending}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
        >
          {sending ? "Отправляем…" : "Отправить ссылку"}
        </button>
        <a
          href="/account/login"
          className="text-center text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Назад ко входу
        </a>
      </form>
    </AuthCard>
  );
}

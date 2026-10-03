"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Mail } from "lucide-react";
import { AUTH_GHOST, AUTH_LINK_MUTED, AuthCard, AuthField, AuthSubmit } from "@/components/guest/AuthCard";

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
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <svg
            className="h-[60px] w-[84px] animate-[ga-envelope_1.6s_cubic-bezier(.3,1.2,.5,1)_both]"
            viewBox="0 0 84 60"
            fill="none"
            stroke="var(--color-claret)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="80" height="56" rx="8" />
            <path d="M4 6l38 28L80 6" />
          </svg>
          <p role="status" className="text-sm text-muted">
            Если у <b className="text-ink">{email}</b> есть аккаунт, мы отправили на него ссылку для смены пароля.
          </p>
          <a href="/account/login" className={AUTH_GHOST}>
            Назад ко входу
          </a>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Восстановление пароля" subtitle="Отправим ссылку для установки нового пароля.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <AuthField
          label="Email"
          icon={<Mail className="h-[17px] w-[17px]" strokeWidth={2} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="ivan@example.com"
        />
        <AuthSubmit busy={sending} busyText="Отправляем…">
          Отправить ссылку
        </AuthSubmit>
      </form>
      <a href="/account/login" className={AUTH_LINK_MUTED}>
        ← Назад ко входу
      </a>
    </AuthCard>
  );
}

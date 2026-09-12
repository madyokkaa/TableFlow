"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/guest/AuthCard";

function PasswordLogin({ onSwitchToMagicLink }: { onSwitchToMagicLink: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      // Same wrong-password-vs-unknown-email ambiguity as the hostess
      // login, for the same reason: don't let this form be used to check
      // which emails have an account.
      setError(error.message.toLowerCase().includes("invalid") ? "Неверный email или пароль." : error.message);
      return;
    }
    router.replace("/");
    router.refresh();
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
          placeholder="ivan@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Пароль</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
        />
      </label>
      {error && <p className="text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "Входим…" : "Войти"}
      </button>
      <div className="flex items-center justify-between text-sm">
        <a
          href="/account/forgot-password"
          className="text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Забыли пароль?
        </a>
        <button
          type="button"
          onClick={onSwitchToMagicLink}
          className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
        >
          Войти по ссылке
        </button>
      </div>
    </form>
  );
}

function MagicLinkLogin({ onSwitchToPassword }: { onSwitchToPassword: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted">
          Мы отправили ссылку для входа на <span className="text-ink">{email}</span>. Откройте её на этом
          устройстве, чтобы продолжить.
        </p>
      </div>
    );
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
          placeholder="ivan@example.com"
        />
      </label>
      {error && <p className="text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? "Отправляем…" : "Отправить ссылку для входа"}
      </button>
      <button
        type="button"
        onClick={onSwitchToPassword}
        className="text-center text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
      >
        Войти по паролю
      </button>
    </form>
  );
}

export default function GuestLoginPage() {
  const [mode, setMode] = useState<"password" | "magic-link">("password");

  return (
    <AuthCard title="С возвращением" subtitle="Войдите, чтобы видеть свои брони и не вводить данные заново.">
      {mode === "password" ? (
        <PasswordLogin onSwitchToMagicLink={() => setMode("magic-link")} />
      ) : (
        <MagicLinkLogin onSwitchToPassword={() => setMode("password")} />
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <a href="/account/register" className="text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong">
          Зарегистрироваться
        </a>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link href="/" className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink">
          ← Продолжить как гость
        </Link>
      </p>
    </AuthCard>
  );
}

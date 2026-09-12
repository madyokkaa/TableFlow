"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/guest/AuthCard";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSubmitting(false);
    if (error) {
      // This project has email confirmation disabled (supabase/config.toml:
      // enable_confirmations = false), so GoTrue's usual anti-enumeration
      // trick - an obfuscated success response for an already-registered
      // email - never fires here; an existing email comes back as a real
      // "user_already_exists" error instead. Treat it the same as success
      // rather than surfacing it (which would both leak account existence
      // and, for a staff email that also has an account, defeat the same
      // anti-enumeration the hostess login already relies on) - and never
      // show the raw GoTrue error text, which is in English.
      if (error.code === "user_already_exists" || error.status === 422) {
        setCheckInbox(true);
        return;
      }
      console.error("[account/register] signUp failed", error);
      setError("Не удалось создать аккаунт. Попробуйте позже.");
      return;
    }
    if (data.session) {
      // Confirmation disabled for this project - signed in immediately.
      router.replace("/");
      router.refresh();
      return;
    }
    // Confirmation required after all (project settings changed) - same
    // "check your inbox" state as the error-handled case above.
    setCheckInbox(true);
  }

  if (checkInbox) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted">
          Мы отправили письмо на <span className="text-ink">{email}</span>. Перейдите по ссылке из письма, чтобы
          завершить регистрацию.
        </p>
        <a
          href="/account/login"
          className="mt-5 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Назад ко входу
        </a>
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
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Повторите пароль</span>
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
        />
      </label>
      {error && <p className="text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}

export default function GuestRegisterPage() {
  return (
    <AuthCard title="Создать аккаунт" subtitle="Сохраняйте данные и следите за своими бронями.">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <a href="/account/login" className="text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong">
          Войти
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

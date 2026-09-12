"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BookingFlow } from "@/components/guest/BookingFlow";

function AuthGate() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
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
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="font-display text-2xl text-ink text-balance">Проверьте почту</p>
        <p className="mt-2 text-sm text-muted">
          Мы отправили ссылку для входа на <span className="text-ink">{email}</span>. Откройте её на этом
          устройстве, чтобы продолжить.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-8">
      <p className="font-display text-2xl text-ink text-balance">Войдите, чтобы забронировать</p>
      <p className="mt-2 text-sm text-muted">Отправим одноразовую ссылку на почту — пароль гостям не нужен.</p>
      <label className="mt-6 flex flex-col gap-1.5 text-sm">
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
      {error && <p className="mt-3 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? "Отправляем…" : "Отправить ссылку для входа"}
      </button>
    </form>
  );
}

export default function GuestPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12 sm:py-16">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow</p>
        <h1 className="mt-2 text-balance font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Забронируйте столик
        </h1>
        <p className="mt-3 text-pretty text-muted">Выберите стол на схеме зала, дату и время — мы всё подготовим.</p>
      </header>

      {session === undefined ? (
        <div className="skeleton h-[220px] rounded-2xl border border-line" />
      ) : session === null ? (
        <AuthGate />
      ) : (
        <BookingFlow />
      )}
    </main>
  );
}

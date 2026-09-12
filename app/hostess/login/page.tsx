"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function HostessLoginPage() {
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
      // Supabase deliberately returns the same "invalid credentials" error
      // for a wrong password and a nonexistent email (prevents an attacker
      // from using the login form to enumerate valid staff emails) - so we
      // show one generic message for both rather than guessing which it was.
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "Неверный email или пароль."
          : error.message
      );
      return;
    }
    router.replace("/hostess");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow · Staff</p>
      <h1 className="mt-2 font-display text-3xl text-ink text-balance">Вход для персонала</h1>
      <p className="mt-2 text-sm text-muted">Учётные записи персонала создаются только по приглашению.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
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
          className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "Входим…" : "Войти"}
        </button>
        <a
          href="/hostess/forgot-password"
          className="text-center text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-claret"
        >
          Забыли пароль?
        </a>
      </form>
    </main>
  );
}

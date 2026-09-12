"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");
    if (errorDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading redirect-time URL state on mount
      setLinkError(errorDescription);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let resolved = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || session) && !resolved) {
        resolved = true;
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !resolved) {
        resolved = true;
        setReady(true);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) setLinkError("Эта ссылка истекла или уже была использована. Запросите новую.");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-display text-2xl text-ink text-balance">Пароль обновлён</p>
          <p className="mt-2 text-sm text-muted">Теперь вы можете войти с новым паролем.</p>
          <button
            type="button"
            onClick={() => router.replace("/hostess/login")}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98]"
          >
            Перейти ко входу
          </button>
        </div>
      </main>
    );
  }

  if (linkError) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
        <p className="font-display text-2xl text-ink">Ссылка не сработала</p>
        <p className="mt-2 text-sm text-status-cancelled">{linkError}</p>
        <a
          href="/hostess/forgot-password"
          className="mt-5 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Запросить новую ссылку
        </a>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted">Проверяем ссылку…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow · Staff</p>
      <h1 className="mt-2 font-display text-3xl text-ink text-balance">Новый пароль</h1>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Новый пароль</span>
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
          <span className="font-medium text-ink">Подтвердите пароль</span>
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
        {formError && <p className="text-sm text-status-cancelled">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </main>
  );
}

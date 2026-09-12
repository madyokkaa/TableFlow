"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/guest/AuthCard";

export default function GuestResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // Whether the recovery link failed, for any reason - never the raw
  // `error_description` query param GoTrue appends to the redirect, which
  // would let anyone craft a link putting arbitrary text on this
  // TableFlow-branded page (a ready-made phishing surface, since this exact
  // URL is what real password-reset emails send). One fixed message covers
  // every failure case; nothing actionable is lost by not echoing GoTrue's.
  const [linkFailed, setLinkFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error") || params.has("error_description")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading redirect-time URL state on mount
      setLinkFailed(true);
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
      if (!resolved) setLinkFailed(true);
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
      <AuthCard title="Пароль обновлён">
        <p className="text-sm text-muted">Теперь вы можете войти с новым паролем.</p>
        <button
          type="button"
          onClick={() => router.replace("/account/login")}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98]"
        >
          Перейти ко входу
        </button>
      </AuthCard>
    );
  }

  if (linkFailed) {
    return (
      <AuthCard title="Ссылка не сработала">
        <p className="text-sm text-status-cancelled">Эта ссылка истекла или уже была использована. Запросите новую.</p>
        <a
          href="/account/forgot-password"
          className="mt-5 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Запросить новую ссылку
        </a>
      </AuthCard>
    );
  }

  if (!ready) {
    return (
      <AuthCard title="Проверяем ссылку…">
        <p className="text-sm text-muted">Секунду…</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Новый пароль">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </AuthCard>
  );
}

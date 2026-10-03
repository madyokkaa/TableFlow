"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Lock } from "lucide-react";
import { AUTH_GHOST, AUTH_LINK, AuthCard, AuthError, AuthSubmit, PasswordField } from "@/components/guest/AuthCard";

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
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <svg className="ga-check h-[72px] w-[72px]" viewBox="0 0 72 72" fill="none" aria-hidden="true">
            <circle cx="36" cy="36" r="32" stroke="var(--color-status-confirmed)" strokeWidth="3" />
            <path d="M23 37l9 9 17-19" stroke="var(--color-status-confirmed)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p role="status" className="text-sm text-muted">
            Теперь вы можете войти с новым паролем.
          </p>
          <button type="button" onClick={() => router.replace("/account/login")} className={AUTH_GHOST}>
            Перейти ко входу
          </button>
        </div>
      </AuthCard>
    );
  }

  if (linkFailed) {
    return (
      <AuthCard title="Ссылка не сработала">
        <p role="alert" className="text-sm text-status-cancelled">
          Эта ссылка истекла или уже была использована. Запросите новую.
        </p>
        <a href="/account/forgot-password" className={AUTH_LINK}>
          Запросить новую ссылку
        </a>
      </AuthCard>
    );
  }

  if (!ready) {
    return (
      <AuthCard title="Проверяем ссылку…">
        <p className="flex items-center gap-3 text-sm text-muted" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-claret/25 border-t-claret" aria-hidden="true" />
          Секунду…
        </p>
      </AuthCard>
    );
  }

  const lock = <Lock className="h-[17px] w-[17px]" strokeWidth={2} />;
  return (
    <AuthCard title="Новый пароль" subtitle="Минимум 8 символов. После сохранения войдите с ним.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <PasswordField
          label="Новый пароль"
          icon={lock}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          hint={password.length >= 8 ? "Отлично" : `Минимум 8 символов${password.length ? ` · ещё ${8 - password.length}` : ""}`}
        />
        <PasswordField
          label="Подтвердите пароль"
          icon={lock}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {formError && <AuthError>{formError}</AuthError>}
        <AuthSubmit busy={submitting} busyText="Сохраняем…">
          Сохранить пароль
        </AuthSubmit>
      </form>
    </AuthCard>
  );
}

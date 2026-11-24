"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AUTH_GHOST, AuthError, AuthSubmit, PasswordField } from "@/components/guest/AuthCard";
import { StaffAuthShell } from "@/components/hostess/StaffAuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // Whether the recovery link failed, for any reason - never the raw
  // `error_description` query param GoTrue appends to the redirect, which
  // would let anyone craft a link putting arbitrary text on this
  // TableFlow-branded page (a ready-made phishing surface, since this exact
  // URL is what real password-reset emails send).
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
      <StaffAuthShell title="Пароль обновлён" subtitle="Теперь вы можете войти с новым паролем." open>
        <button
          type="button"
          onClick={() => router.replace("/hostess/login")}
          className="flex h-[54px] items-center justify-center gap-2.5 rounded-[15px] bg-claret text-[15px] font-bold text-on-accent transition-[transform,box-shadow] duration-200 hover:shadow-[0_16px_34px_-16px_var(--color-claret)] active:scale-[0.98]"
        >
          Перейти ко входу
        </button>
      </StaffAuthShell>
    );
  }

  if (linkFailed) {
    return (
      <StaffAuthShell title="Ссылка не сработала" subtitle="Эта ссылка истекла или уже была использована. Запросите новую.">
        <a href="/hostess/forgot-password" className={AUTH_GHOST + " justify-center"}>
          Запросить новую ссылку
        </a>
      </StaffAuthShell>
    );
  }

  if (!ready) {
    return (
      <StaffAuthShell title="Проверяем ссылку…" subtitle="Секунду…">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-claret/25 border-t-claret" role="status" aria-label="Проверяем ссылку" />
      </StaffAuthShell>
    );
  }

  const lock = <Lock className="h-[17px] w-[17px]" strokeWidth={2} />;
  return (
    <StaffAuthShell title="Новый пароль" subtitle="Минимум 8 символов. После сохранения войдите с ним.">
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
    </StaffAuthShell>
  );
}

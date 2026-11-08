"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  AUTH_GHOST,
  AUTH_LINK,
  AUTH_LINK_MUTED,
  AuthCard,
  AuthError,
  AuthField,
  AuthOverlay,
  AuthSubmit,
  PasswordField,
} from "./AuthCard";
import { SetTableScene } from "./SetTableScene";
import { useI18n } from "@/components/i18n/I18nProvider";

export type GuestAuthMode = "login" | "register" | "link";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

/** Guest login / registration / magic-link sign-in on one card. Switching
 * tabs keeps the typed email; the URL follows the tab so a reload lands on
 * the same form. Auth calls are the same as before the redesign. */
export function GuestAuthForm({ initialMode, initialEmail = "" }: { initialMode: GuestAuthMode; initialEmail?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<GuestAuthMode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "done" | "sent">("idle");
  const redirectTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isLink = mode === "link";
  const emailOk = EMAIL_RE.test(email.trim());
  const passwordOk = isRegister ? password.length >= MIN_PASSWORD : password.length > 0;
  const confirmOk = confirmPassword.length >= MIN_PASSWORD && confirmPassword === password;
  const ready = isLink ? emailOk : isRegister ? emailOk && passwordOk && confirmOk : emailOk && passwordOk;
  const done = phase === "done";

  const caption = done
    ? t.auth.captionWelcome
    : ready
      ? t.auth.captionReady
      : emailOk
        ? isLink
          ? t.auth.captionLink
          : t.auth.captionAlmost
        : t.auth.captionSetting;

  function switchMode(next: GuestAuthMode) {
    setMode(next);
    setError(null);
    setPhase("idle");
    const path = next === "register" ? "/account/register" : "/account/login";
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  }

  function fail(message: string) {
    setError(message);
    setErrorKey((k) => k + 1);
  }

  function signedIn() {
    setPhase("done");
    redirectTimer.current = window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1600);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createBrowserSupabaseClient();

    if (isLink) {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) {
        console.error("[account/login] signInWithOtp failed", error);
        fail(t.auth.linkFailed);
        return;
      }
      setPhase("sent");
      return;
    }

    if (isLogin) {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        // Same wrong-password-vs-unknown-email ambiguity as the hostess
        // login, for the same reason: don't let this form be used to check
        // which emails have an account.
        if (!error.message.toLowerCase().includes("invalid")) {
          console.error("[account/login] signInWithPassword failed", error);
        }
        fail(
          error.message.toLowerCase().includes("invalid")
            ? t.auth.wrongCredentials
            : t.auth.loginFailed
        );
        return;
      }
      signedIn();
      return;
    }

    if (password.length < MIN_PASSWORD) {
      fail(t.auth.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      fail(t.auth.passwordsMismatch);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
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
        setPhase("sent");
        return;
      }
      console.error("[account/register] signUp failed", error);
      fail(t.auth.registerFailed);
      return;
    }
    if (data.session) {
      // Confirmation disabled for this project - signed in immediately.
      signedIn();
      return;
    }
    // Confirmation required after all (project settings changed) - same
    // "check your inbox" state as the error-handled case above.
    setPhase("sent");
  }

  const copy = t.auth[mode];
  const overlay =
    phase === "done" ? (
      <AuthOverlay
        icon="check"
        title={isRegister ? t.auth.accountCreated : t.auth.signedIn}
        actions={
          <>
            <Link href="/" className="gp-shine relative inline-flex h-[46px] items-center overflow-hidden rounded-[13px] bg-claret px-[22px] text-sm font-bold text-on-accent">
              {t.common.bookTable}
            </Link>
            <a href="/account" className={AUTH_GHOST}>
              {t.common.myBookings}
            </a>
          </>
        }
      >
        {t.auth.tableSet}
      </AuthOverlay>
    ) : phase === "sent" ? (
      <AuthOverlay
        icon="envelope"
        title={isLink ? t.auth.linkSent : t.auth.checkMail}
        actions={
          <button
            type="button"
            className={AUTH_GHOST}
            onClick={() => {
              if (isLink) {
                setPhase("idle");
                setEmail("");
              } else {
                switchMode("login");
              }
            }}
          >
            {isLink ? t.auth.otherEmail : t.auth.backToLogin}
          </button>
        }
      >
        {isLink ? (
          <>
            {t.auth.linkSentTo} <b className="text-ink">{email}</b>. {t.auth.linkSentAfter}
          </>
        ) : (
          <>
            {t.auth.mailSentTo} <b className="text-ink">{email}</b>. {t.auth.mailSentAfter}
          </>
        )}
      </AuthOverlay>
    ) : null;

  const steps = [
    { label: "Email", on: emailOk },
    ...(isLink ? [] : [{ label: t.auth.password, on: passwordOk }]),
    ...(isRegister ? [{ label: t.auth.repeat, on: confirmOk }] : []),
    { label: t.auth.tableReady, on: ready },
  ];

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      overlay={overlay}
      aside={
        <SetTableScene
          plates={emailOk}
          glasses={isLink ? emailOk : passwordOk}
          napkins={isRegister && confirmOk}
          ready={ready}
          done={done}
          caption={caption}
          steps={steps}
        />
      }
    >
      {!isLink && (
        <div role="tablist" aria-label={t.auth.tabsAria} className="relative grid grid-cols-2 rounded-[14px] border border-line-strong bg-paper p-1">
          <span
            aria-hidden="true"
            className="absolute left-1 top-1 h-10 w-[calc(50%-4px)] rounded-[10px] border border-[#4d2c36] bg-[#2e1c21] transition-transform duration-500 ease-[cubic-bezier(.3,1.3,.5,1)]"
            style={{ transform: `translateX(${isRegister ? 100 : 0}%)` }}
          />
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`relative z-[1] h-10 text-sm font-semibold transition-colors duration-300 ${mode === m ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {m === "login" ? t.auth.tabLogin : t.auth.tabRegister}
            </button>
          ))}
        </div>
      )}

      <form key={mode} onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <AuthField
          label="Email"
          icon={<Mail className="h-[17px] w-[17px]" strokeWidth={2} />}
          ok={emailOk}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="ivan@example.com"
          delay={60}
        />
        {!isLink && (
          <PasswordField
            label={t.auth.password}
            icon={<Lock className="h-[17px] w-[17px]" strokeWidth={2} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? MIN_PASSWORD : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            delay={120}
            hint={
              isRegister
                ? passwordOk
                  ? t.auth.great
                  : t.auth.minChars(MIN_PASSWORD, MIN_PASSWORD - password.length)
                : undefined
            }
          />
        )}
        {isRegister && (
          <PasswordField
            label={t.auth.repeatPassword}
            icon={<Lock className="h-[17px] w-[17px]" strokeWidth={2} />}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            delay={180}
            hint={confirmPassword && !confirmOk ? t.auth.notMatchingYet : confirmOk ? t.auth.matching : undefined}
          />
        )}

        {error && <AuthError key={errorKey}>{error}</AuthError>}

        <AuthSubmit busy={busy} disabled={!ready || done} busyText={copy.busy}>
          {copy.submit}
        </AuthSubmit>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isLogin && (
          <a href="/account/forgot-password" className={AUTH_LINK}>
            {t.auth.forgot}
          </a>
        )}
        <button type="button" onClick={() => switchMode(isLink ? "login" : "link")} className={AUTH_LINK_MUTED}>
          {isLink ? t.auth.withPassword : t.auth.withLink}
        </button>
      </div>
    </AuthCard>
  );
}

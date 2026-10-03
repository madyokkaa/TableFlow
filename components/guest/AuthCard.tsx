"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from "lucide-react";

export const AUTH_GHOST =
  "inline-flex h-[46px] items-center gap-2 rounded-[13px] border border-line-strong bg-transparent px-[18px] text-sm font-semibold text-ink/90 transition-[border-color,background-color,color] duration-200 hover:border-[#8a6a62] hover:bg-surface-raised hover:text-ink";

export const AUTH_LINK =
  "inline-flex min-h-9 items-center text-[13px] font-semibold text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong";

export const AUTH_LINK_MUTED =
  "inline-flex min-h-9 items-center text-[13px] font-semibold text-muted underline decoration-muted/35 underline-offset-4 transition-colors hover:text-ink";

/** Shell for the guest auth screens (login, register, forgot/reset
 * password): a wide card over a drifting lamp. With `aside` it splits in
 * two - the illustration on the left, the form on the right (stacked on
 * narrow screens). Not used by the hostess side. */
export function AuthCard({
  title,
  subtitle,
  aside,
  overlay,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  /** Covers the form column (success / "check your inbox" states). */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh w-full flex-1 items-center justify-center overflow-hidden px-4 py-8">
      <div className="gp-lamp !left-1/2 !right-auto !top-1/2 -ml-[560px] -mt-[380px]" aria-hidden="true" />
      <div
        className={`relative grid w-full animate-[gp-up_.7s_cubic-bezier(.2,.8,.2,1)_both] overflow-hidden rounded-[30px] border border-line bg-[#1a1311] shadow-[0_50px_100px_-50px_#000] ${
          aside ? "max-w-[980px] md:grid-cols-2" : "max-w-[480px]"
        }`}
      >
        {aside}
        <div className="relative flex flex-col gap-[18px] px-5 py-7 sm:px-10 sm:pb-[34px] sm:pt-10">
          <span className="font-mono text-[11px] tracking-[0.28em] text-[#c9b6ae]">TABLEFLOW</span>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[38px] font-normal leading-[1.05] tracking-[-0.02em] text-balance">{title}</h1>
            {subtitle && <p className="text-sm leading-normal text-muted text-pretty">{subtitle}</p>}
          </div>
          {children}
          <Link
            href="/"
            className="group mt-auto flex min-h-11 items-center justify-center gap-2 border-t border-[#2c2220] pt-3.5 text-[13px] text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={2} aria-hidden="true" />
            Продолжить как гость — без аккаунта
          </Link>
          {overlay}
        </div>
      </div>
    </main>
  );
}

/** Full-cover state over the form column: a drawn check mark or a flying
 * envelope, a heading, a line of text and actions. */
export function AuthOverlay({
  icon,
  title,
  children,
  actions,
}: {
  icon: "check" | "envelope";
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex animate-[fp-fadein_.4s_both] flex-col items-center justify-center gap-3.5 bg-[#1a1311] p-8 text-center"
    >
      {icon === "check" ? (
        <svg className="ga-check h-[72px] w-[72px]" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <circle cx="36" cy="36" r="32" stroke="var(--color-status-confirmed)" strokeWidth="3" />
          <path d="M23 37l9 9 17-19" stroke="var(--color-status-confirmed)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
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
      )}
      <div className="font-display text-[30px]">{title}</div>
      <div className="max-w-[320px] text-sm text-muted">{children}</div>
      {actions && <div className="flex flex-wrap justify-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** A labelled input with a leading icon and a green tick once `ok`. */
export function AuthField({
  label,
  icon,
  ok,
  hint,
  trailing,
  delay = 0,
  ...input
}: {
  label: string;
  icon: ReactNode;
  ok?: boolean;
  hint?: ReactNode;
  trailing?: ReactNode;
  delay?: number;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div
      className="flex animate-[gp-up_.45s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-[7px] text-[13px] font-semibold"
      style={{ animationDelay: `${delay}ms` }}
    >
      <label htmlFor={id}>{label}</label>
      <span className="group relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7d6a64] transition-colors group-focus-within:text-claret">
          {icon}
        </span>
        <input
          {...input}
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-[50px] w-full rounded-[14px] border border-line-strong bg-paper pl-[42px] pr-[46px] text-[15px] font-normal outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#6f5d57] focus:border-claret focus:shadow-[0_0_0_4px_rgb(236_143_163/0.12)]"
        />
        {trailing ??
          (ok && (
            <span className="absolute right-3.5 top-1/2 -mt-2.5 flex h-5 w-5 animate-[ga-pop_.4s_cubic-bezier(.3,1.7,.5,1)_both] items-center justify-center rounded-full bg-status-confirmed text-[#13261a]">
              <Check className="h-[11px] w-[11px]" strokeWidth={3.5} aria-hidden="true" />
            </span>
          ))}
      </span>
      {hint && (
        <span id={`${id}-hint`} aria-live="polite" className="text-xs font-medium text-[#8f7c75]">
          {hint}
        </span>
      )}
    </div>
  );
}

/** AuthField for passwords, with a show/hide toggle in place of the tick. */
export function PasswordField(props: Omit<Parameters<typeof AuthField>[0], "trailing" | "type">) {
  const [shown, setShown] = useState(false);
  return (
    <AuthField
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={shown}
          className="absolute right-1.5 top-[7px] flex h-9 w-9 items-center justify-center rounded-[10px] text-[#a8958e] transition-colors hover:bg-[#2a201d] hover:text-ink"
        >
          {shown ? <EyeOff className="h-[17px] w-[17px]" strokeWidth={2} /> : <Eye className="h-[17px] w-[17px]" strokeWidth={2} />}
        </button>
      }
    />
  );
}

/** The claret submit button with a shine sweep and a spinner while busy. */
export function AuthSubmit({
  busy,
  disabled,
  busyText,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  busyText: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="gp-shine relative flex h-[54px] items-center justify-center gap-2.5 overflow-hidden rounded-[15px] bg-claret text-[15px] font-bold text-on-accent transition-[transform,box-shadow,background-color,color] duration-200 enabled:hover:shadow-[0_16px_34px_-16px_var(--color-claret)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#2c2220] disabled:text-[#8f7c75]"
    >
      {busy ? (
        <>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-on-accent/25 border-t-on-accent" aria-hidden="true" />
          {busyText}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
        </>
      )}
    </button>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="animate-[fp-shake_.4s] text-sm text-status-cancelled">
      {children}
    </p>
  );
}

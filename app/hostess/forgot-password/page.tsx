"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/hostess/reset-password`,
    });
    setSending(false);
    // Always show the same "check your inbox" state regardless of outcome -
    // real recovery emails are sent by Supabase's own mailer (the same one
    // already delivering guest magic links), and surfacing any error here
    // (including a rate-limit message, which is itself distinguishable from
    // "unknown address") would let anyone probe this form to discover which
    // addresses have staff accounts. Failures are still logged for us.
    if (error) {
      console.error("[forgot-password] resetPasswordForEmail failed", error);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-display text-2xl text-ink text-balance">Check your inbox</p>
          <p className="mt-2 text-sm text-muted">
            If <span className="text-ink">{email}</span> has a staff account, we&apos;ve sent a password reset
            link to it.
          </p>
          <a
            href="/hostess/login"
            className="mt-5 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
          >
            Back to sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow · Staff</p>
      <h1 className="mt-2 font-display text-3xl text-ink text-balance">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">We&apos;ll email you a link to set a new password.</p>

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
        <button
          type="submit"
          disabled={sending}
          className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send reset link"}
        </button>
        <a
          href="/hostess/login"
          className="text-center text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-claret"
        >
          Back to sign in
        </a>
      </form>
    </main>
  );
}

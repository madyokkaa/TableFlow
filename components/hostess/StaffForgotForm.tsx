"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AUTH_GHOST, AuthField, AuthSubmit } from "@/components/guest/AuthCard";

/** Staff password-reset request: one email field, then the same "if such a
 * staff member exists, the letter is on its way" line whatever happened. */
export function StaffForgotForm({ initialEmail = "", onBack }: { initialEmail?: string; onBack?: () => void }) {
  const [email, setEmail] = useState(initialEmail);
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sent ? (
        <p role="status" className="text-sm text-[#a8dcbc]">
          Если сотрудник с адресом <b className="text-ink">{email}</b> есть, письмо со ссылкой уже в пути.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Пришлём ссылку на рабочую почту. Если доступа к почте нет — обратитесь к администратору.
        </p>
      )}
      <AuthField
        label="Рабочий email"
        icon={<Mail className="h-[17px] w-[17px]" strokeWidth={2} />}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setSent(false);
        }}
        type="email"
        required
        autoComplete="username"
        placeholder="hostess@restoran.kz"
      />
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-col">
          <AuthSubmit busy={sending} disabled={sent || !email.trim()} busyText="Отправляем…">
            {sent ? "Ссылка отправлена" : "Прислать ссылку"}
          </AuthSubmit>
        </div>
        {onBack ? (
          <button type="button" onClick={onBack} className={`${AUTH_GHOST} h-[54px]`}>
            Назад
          </button>
        ) : (
          <a href="/hostess/login" className={`${AUTH_GHOST} h-[54px]`}>
            Ко входу
          </a>
        )}
      </div>
    </form>
  );
}

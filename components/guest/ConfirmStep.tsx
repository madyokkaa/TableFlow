"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { formatDateTime, guestsLabel } from "@/lib/ru";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import type { DiningTable } from "@/components/hostess/TableForm";

export function ConfirmStep({
  table,
  date,
  time,
  partySize,
  submitting,
  error,
  onSubmit,
  defaultName = "",
  defaultPhone = "",
  defaultEmail = "",
}: {
  table: DiningTable;
  date: string;
  time: string;
  partySize: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (fields: { name: string; phone: string; email: string }) => void;
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);

  const hasContact = phone.trim().length > 0 || email.trim().length > 0;
  const canSubmit = name.trim().length > 0 && hasContact && !submitting;
  const prefilled = Boolean(defaultName || defaultPhone || defaultEmail);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="border-b border-line pb-4">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Ваш столик</p>
        <p className="mt-1 font-mono text-lg font-medium tabular-nums capitalize">{formatDateTime(date, time)}</p>
        <p className="text-sm text-muted">
          Стол {table.label} · {guestsLabel(partySize)}
        </p>
      </div>

      {prefilled && (
        <p className="-mb-1 text-xs text-muted">Данные подставлены из вашего аккаунта — при необходимости измените.</p>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Имя</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="Иван Иванов"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Телефон</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            autoComplete="tel"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
            placeholder="+7 900 000-00-00"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            maxLength={255}
            autoComplete="email"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
            placeholder="ivan@example.com"
          />
        </label>
      </div>
      {!hasContact && (
        <p className="-mt-2 text-xs text-muted">Укажите телефон или email, чтобы мы могли с вами связаться.</p>
      )}

      {error && <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}

      <motion.button
        type="submit"
        disabled={!canSubmit}
        whileHover={canSubmit ? { scale: 1.02 } : undefined}
        whileTap={canSubmit ? { scale: 0.97 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-claret-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <LoadingIndicator label="Подтверждаем…" /> : "Забронировать стол"}
      </motion.button>
    </form>
  );
}

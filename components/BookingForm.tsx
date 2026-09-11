"use client";

import { useState, type FormEvent } from "react";
import type { AvailableSlot } from "./SlotGrid";

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function BookingForm({
  slot,
  submitting,
  error,
  onSubmit,
  onChangeSlot,
}: {
  slot: AvailableSlot;
  submitting: boolean;
  error: string | null;
  onSubmit: (fields: { name: string; phone: string; email: string }) => void;
  onChangeSlot: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const hasContact = phone.trim().length > 0 || email.trim().length > 0;
  const canSubmit = name.trim().length > 0 && hasContact && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-in flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6"
      style={{
        animation: "form-enter 260ms ease-out",
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Your table</p>
          <p className="mt-1 font-mono text-lg font-medium tabular-nums">{formatTime(slot.start_time)}</p>
          <p className="text-sm text-muted">
            Table {slot.table_number} · {slot.zone} · seats {slot.capacity}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeSlot}
          className="text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Change
        </button>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="Jane Doe"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            autoComplete="tel"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
            placeholder="+1 555 0100"
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
            placeholder="jane@example.com"
          />
        </label>
      </div>
      {!hasContact && (
        <p className="-mt-2 text-xs text-muted">Give us a phone number or an email so we can reach you.</p>
      )}

      {error && (
        <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {submitting ? "Confirming…" : "Request this table"}
      </button>
    </form>
  );
}

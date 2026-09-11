"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-pretty text-sm text-muted">{message}</p>
      {error && <p className="mt-3 rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 ${
            danger ? "bg-status-cancelled hover:brightness-90" : "bg-claret hover:bg-claret-strong"
          }`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

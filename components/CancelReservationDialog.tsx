"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Modal } from "./Modal";
import { OTHER_REASON } from "@/lib/reservations";

const CHIP =
  "inline-flex min-h-11 items-center rounded-[13px] border px-3.5 py-2 text-left text-[13px] font-semibold transition-[border-color,background-color,color] duration-200";

/** Cancel/reject confirmation with an optional reason, picked from a row of
 * chips (a dropdown here would be clipped by the modal's scroll area).
 * Confirming without picking a reason is always allowed; picking "Другое"
 * reveals a free-text field instead of forcing one of the presets. */
export function CancelReservationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  reasons,
  confirmLabel = "Отменить бронь",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string | null) => Promise<void> | void;
  title: string;
  message: string;
  reasons: readonly string[];
  confirmLabel?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason(null);
    setCustomReason("");
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const finalReason = reason === OTHER_REASON ? customReason.trim() || null : reason;
      await onConfirm(finalReason);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <p className="text-pretty text-sm text-muted">{message}</p>

      <p className="mt-4 text-[13px] font-semibold text-ink">Причина (необязательно)</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Причина отмены">
        {[...reasons, OTHER_REASON].map((r) => {
          const on = reason === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason((current) => (current === r ? null : r))}
              className={`${CHIP} ${
                on
                  ? "border-status-cancelled bg-status-cancelled-tint text-status-cancelled"
                  : "border-line-strong text-ink/90 hover:border-[#8a6a62] hover:bg-surface-raised"
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {reason === OTHER_REASON && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              maxLength={500}
              rows={2}
              autoFocus
              aria-label="Своя причина"
              placeholder="Опишите причину…"
              className="w-full resize-none rounded-[13px] border border-line-strong bg-[#1a1311] px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-claret"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="mt-3 rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={handleClose}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-[13px] border border-line-strong px-4 text-sm font-semibold text-ink/90 transition-colors hover:border-[#8a6a62] hover:bg-surface-raised disabled:opacity-50"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-[13px] bg-status-cancelled px-[18px] text-sm font-bold text-on-accent transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Выполняем…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { OTHER_REASON } from "@/lib/reservations";

/** Cancel/reject confirmation with an optional reason combobox - shared by
 * the guest's own cancel flow and the hostess's reject flow, each passing
 * its own `reasons` list (the two contexts mean genuinely different things
 * by "why"). Confirming without picking a reason is always allowed; picking
 * "Другое" reveals a free-text field instead of forcing one of the presets. */
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

  const options = [...reasons.map((r) => ({ value: r, label: r })), { value: OTHER_REASON, label: OTHER_REASON }];

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <p className="text-pretty text-sm text-muted">{message}</p>

      <label className="mt-4 flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Причина (необязательно)</span>
        <Combobox
          ariaLabel="Причина отмены"
          placeholder="Не указывать"
          options={options}
          value={reason}
          onChange={setReason}
        />
      </label>

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
              placeholder="Опишите причину…"
              className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="mt-3 rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-status-cancelled px-4 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:brightness-90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Выполняем…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

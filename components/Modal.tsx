"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      style={{ animation: "modal-backdrop-in 150ms ease-out" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-xl"
        style={{ animation: "modal-panel-in 200ms ease-out", maxHeight: "min(85dvh, 100%)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 p-6 pb-4">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <motion.button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-paper hover:text-ink"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </motion.button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check } from "lucide-react";

export type ToastAction = { label: string; run: () => void };
type ToastState = { id: number; text: string; tone: "ok" | "error"; action?: ToastAction; duration: number };

/** One toast at a time for the staff panel: a new one replaces the old.
 * Toasts with an action (e.g. «Вернуть») stay up a little longer. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const show = useCallback((text: string, options: { tone?: "ok" | "error"; action?: ToastAction } = {}) => {
    window.clearTimeout(timerRef.current);
    idRef.current += 1;
    const duration = options.action ? 6000 : 3600;
    setToast({ id: idRef.current, text, tone: options.tone ?? "ok", action: options.action, duration });
    timerRef.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { toast, show, dismiss };
}

/** Bottom-right light toast with a check (or alert) badge, an optional
 * action button and a claret progress line counting down its lifetime. */
const noopSubscribe = () => () => {};

export function Toaster({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  // Portal only after hydration - the server has no document.body.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-end sm:inset-x-auto sm:bottom-7 sm:right-7" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className="pointer-events-auto relative flex max-w-full items-center gap-3.5 overflow-hidden rounded-2xl bg-ink py-3 pl-4 pr-3 text-sm font-semibold text-surface shadow-[0_24px_50px_-20px_#000]"
          >
            <span
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface ${
                toast.tone === "error" ? "text-status-cancelled" : "text-status-confirmed"
              }`}
              aria-hidden="true"
            >
              {toast.tone === "error" ? <AlertCircle className="h-4 w-4" strokeWidth={2.4} /> : <Check className="h-4 w-4" strokeWidth={2.6} />}
            </span>
            <span className="min-w-0">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  onDismiss();
                }}
                className="h-11 shrink-0 rounded-[10px] bg-surface px-3 font-bold text-ink transition-colors hover:bg-surface-raised"
              >
                {toast.action.label}
              </button>
            )}
            <motion.span
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-claret"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: toast.duration / 1000, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

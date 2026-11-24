"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, X } from "lucide-react";
import { apiFetch, parseError } from "@/lib/api";
import type { PendingReservation } from "@/hooks/usePendingReservations";
import { addDaysIso, restaurantTodayIso } from "@/lib/scheduling";
import { formatDateShort, formatTime, guestsLabel } from "@/lib/ru";

function relativeDay(iso: string): string {
  const today = restaurantTodayIso();
  if (iso === today) return "сегодня";
  if (iso === addDaysIso(today, 1)) return "завтра";
  return formatDateShort(iso);
}

function tablesLabel(reservation: PendingReservation): string | null {
  const labels = reservation.reservation_tables
    .map((rt) => rt.dining_tables?.label)
    .filter((label): label is string => !!label);
  if (labels.length === 0) return null;
  return `${labels.length > 1 ? "столы" : "стол"} ${labels.join(", ")}`;
}

/** Header bell: a badge with the pending-booking count and a dropdown that
 * lets staff confirm or decline each one in place. */
export function NotificationBell({
  pending,
  onResolved,
}: {
  pending: PendingReservation[] | null;
  onResolved: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const count = pending?.length ?? 0;

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function resolve(id: number, status: "confirmed" | "cancelled") {
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      onResolved(id);
    } catch {
      setError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count ? `Уведомления: ${count} ожидают подтверждения` : "Уведомления"}
        className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] border text-muted transition-[background-color,border-color,color] duration-200 hover:border-line-strong hover:bg-surface-raised hover:text-ink ${
          open ? "border-line-strong bg-surface-raised text-ink" : "border-line"
        }`}
      >
        <Bell className="animate-bell-ring h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-claret px-[5px] text-[10px] font-bold leading-none text-on-accent shadow-[0_0_0_3px_var(--color-paper)]">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Заявки на подтверждение"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-[calc(100%+10px)] z-40 w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[20px] border border-line-strong bg-surface shadow-[var(--shadow-floating)]"
          >
            <div className="flex items-center justify-between border-b border-line px-[18px] py-4">
              <b className="text-sm font-semibold">Ждут подтверждения</b>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-status-pending-tint px-2.5 text-xs font-semibold text-status-pending">
                <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {count}
              </span>
            </div>

            {error && (
              <p role="alert" className="border-b border-line bg-status-cancelled-tint px-[18px] py-2.5 text-xs text-status-cancelled">
                {error}
              </p>
            )}

            <div className="max-h-[360px] overflow-y-auto">
              {pending === null ? (
                <div className="flex flex-col gap-2 p-[18px]">
                  <div className="skeleton h-10 rounded-lg" />
                  <div className="skeleton h-10 rounded-lg" />
                </div>
              ) : count === 0 ? (
                <p className="px-[18px] py-7 text-center text-[13px] text-muted">
                  Новых заявок нет — всё подтверждено.
                </p>
              ) : (
                <ul>
                  <AnimatePresence initial={true}>
                    {pending.map((reservation, i) => {
                      const tables = tablesLabel(reservation);
                      const busy = busyId === reservation.id;
                      return (
                        <motion.li
                          key={reservation.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 24 }}
                          transition={{ duration: 0.35, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
                          className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line/70 px-[18px] py-3"
                        >
                          <span
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-claret-tint font-display text-base text-claret"
                            aria-hidden="true"
                          >
                            {reservation.guest_name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <b className="block truncate text-[13px] font-semibold">{reservation.guest_name}</b>
                            <small className="mt-0.5 block truncate text-[11.5px] text-muted">
                              <span className="font-mono">{formatTime(reservation.start_time)}</span>
                              {" · "}
                              {guestsLabel(reservation.party_size)}
                              {tables && ` · ${tables}`}
                              {" · "}
                              {relativeDay(reservation.date)}
                            </small>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => resolve(reservation.id, "confirmed")}
                            aria-label={`Подтвердить бронь: ${reservation.guest_name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-status-confirmed/30 bg-status-confirmed-tint text-status-confirmed transition-[transform,filter] duration-200 ease-[var(--ease-spring)] hover:scale-110 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                          >
                            <Check className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => resolve(reservation.id, "cancelled")}
                            aria-label={`Отклонить бронь: ${reservation.guest_name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-status-cancelled/30 bg-status-cancelled-tint text-status-cancelled transition-[transform,filter] duration-200 ease-[var(--ease-spring)] hover:scale-110 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                          >
                            <X className="h-[15px] w-[15px]" strokeWidth={2.4} aria-hidden="true" />
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            <Link
              href="/hostess?status=pending"
              onClick={() => setOpen(false)}
              className="flex h-12 w-full items-center justify-center text-[13px] font-semibold text-claret transition-colors duration-150 hover:bg-claret-tint"
            >
              Открыть все брони →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

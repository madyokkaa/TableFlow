"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { guestsLabel } from "@/lib/ru";
import { timeToMinutes } from "@/lib/scheduling";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { Reservation } from "./types";

const CHIP_SHAPE: Record<DiningTable["shape"], string> = {
  round: "h-[38px] w-[38px] rounded-full",
  rectangle: "h-[34px] w-12 rounded-[10px]",
  square: "h-[38px] w-[38px] rounded-[10px]",
};

/** A table label drawn in its own shape - shared by the list and the grid. */
export function TableChip({ label, shape, small = false }: { label: string; shape?: DiningTable["shape"]; small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-[#4a3833] bg-[#261d1a] font-display text-ink transition-transform duration-300 ease-[cubic-bezier(.3,1.5,.5,1)] group-hover:-rotate-[8deg] ${
        small ? "scale-[.8] text-[13px] group-hover:scale-[.86]" : "text-[15px] group-hover:scale-[1.08]"
      } ${CHIP_SHAPE[shape ?? "square"]}`}
    >
      {label}
    </span>
  );
}

function relativeTime(startTime: string, durationMinutes: number, nowMinutes: number): { text: string; soon: boolean } | null {
  const start = timeToMinutes(startTime);
  const diff = start - nowMinutes;
  if (nowMinutes >= start && nowMinutes < start + durationMinutes) return { text: "идёт сейчас", soon: true };
  if (diff <= 0) return null;
  if (diff < 60) return { text: `через ${diff} мин`, soon: true };
  return { text: `через ${Math.floor(diff / 60)} ч`, soon: false };
}

/** One booking in the list: time (and how soon, today), table chip, guest
 * with a dot per guest, status, ✓/✕ for a pending one and «Изменить». */
export function BookingRow({
  reservation,
  tablesById,
  nowMinutes,
  highlighted,
  index,
  onAccept,
  onReject,
  onEdit,
}: {
  reservation: Reservation;
  tablesById: Map<number, DiningTable>;
  /** Restaurant-local minutes now when the list is for today, else null. */
  nowMinutes: number | null;
  highlighted: boolean;
  index: number;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const r = reservation;
  const first = r.reservation_tables[0]?.dining_tables;
  const labels = r.reservation_tables.map((rt) => rt.dining_tables.label);
  const rel =
    nowMinutes !== null && (r.status === "pending" || r.status === "confirmed")
      ? relativeTime(r.start_time, r.duration_minutes, nowMinutes)
      : null;
  const pending = r.status === "pending";

  return (
    <div
      className={`group relative grid animate-[gp-up_.5s_cubic-bezier(.2,.8,.2,1)_both] grid-cols-[72px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-[#2a201d] px-4 py-3.5 transition-[background-color,opacity] duration-300 last:border-b-0 hover:bg-surface-raised before:absolute before:bottom-3.5 before:left-0 before:top-3.5 before:w-[3px] before:rounded-r-[3px] before:transition-colors md:grid-cols-[96px_170px_minmax(0,1fr)_auto] md:px-5 ${
        pending ? "before:bg-status-pending" : "before:bg-transparent"
      } ${r.status === "cancelled" ? "opacity-60 hover:opacity-100" : ""} ${highlighted ? "animate-new-row" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="font-mono text-base font-medium tabular-nums">
        {r.start_time.slice(0, 5)}
        {rel && <small className={`mt-[3px] block text-[10.5px] font-normal ${rel.soon ? "text-claret" : "text-[#a8958e]"}`}>{rel.text}</small>}
      </div>
      <div className="hidden min-w-0 items-center gap-2.5 text-xs text-[#b3a19a] md:flex">
        {first ? (
          <>
            <TableChip label={labels.join("+")} shape={tablesById.get(first.id)?.shape} />
            <span className="truncate">{first.halls.name}</span>
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <b className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-bold">
          <span className="truncate">{r.guest_name}</span>
          <span className="inline-flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: Math.min(r.party_size, 8) }).map((_, i) => (
              <i key={i} className="block h-2.5 w-[7px] rounded-[3px_3px_2px_2px] bg-[#5a3f45]" />
            ))}
          </span>
          <span className="text-xs font-medium text-muted">{guestsLabel(r.party_size)}</span>
        </b>
        <small className="truncate text-xs text-[#a8958e]">
          <span className="md:hidden">{labels.length ? `стол ${labels.join(", ")} · ` : ""}</span>
          {r.guest_phone || r.guest_email}
        </small>
        {r.status === "cancelled" && r.cancellation_reason && (
          <small className="text-xs text-status-cancelled">
            {r.cancelled_by === "guest" ? "Гость: " : "Персонал: "}
            {r.cancellation_reason}
          </small>
        )}
      </div>
      <div className="col-span-full flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        <StatusPill status={r.status} />
        <AnimatePresence initial={false} mode="popLayout">
          {pending && (
            <motion.span
              key="quick"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={onAccept}
                aria-label={`Подтвердить бронь: ${r.guest_name}, ${r.start_time.slice(0, 5)}`}
                className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-[#2f4234] bg-[#18201a] text-status-confirmed transition-[transform,background-color] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)] hover:scale-110 hover:bg-[#20302a]"
              >
                <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onReject}
                aria-label={`Отклонить бронь: ${r.guest_name}, ${r.start_time.slice(0, 5)}`}
                className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-[#4a2a26] bg-[#221614] text-status-cancelled transition-[transform,background-color] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)] hover:scale-110 hover:bg-[#2e1b18]"
              >
                <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Изменить
        </button>
      </div>
    </div>
  );
}

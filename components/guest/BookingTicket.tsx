"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { hallPlanSize } from "@/lib/floorPlan";
import { tableSize } from "@/lib/tableShapes";
import { GUEST_CANCELLATION_REASONS, OTHER_REASON } from "@/lib/reservations";
import { RESTAURANT_UTC_OFFSET_MINUTES } from "@/lib/scheduling";
import { formatTime, guestsLabel } from "@/lib/ru";
import { planUnits } from "@/components/floor-plan/PlanShapes";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

export type TicketReservation = {
  id: number;
  date: string;
  start_time: string;
  party_size: number;
  status: string;
  hallName: string;
  tableLabels: string[];
  tableIds: number[];
  hallId: number | null;
};

const GHOST =
  "inline-flex h-11 items-center gap-2 rounded-[13px] border border-line-strong bg-transparent px-4 text-[13px] font-semibold text-ink/90 transition-[border-color,background-color,color] duration-200 hover:border-[#8a6a62] hover:bg-surface-raised disabled:opacity-50";

/** Milliseconds until a reservation starts, reading its date/time in the
 * restaurant's fixed UTC offset (see lib/scheduling). */
function msUntil(date: string, time: string, now: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const startUtc = Date.UTC(y, m - 1, d, hh, mm) - RESTAURANT_UTC_OFFSET_MINUTES * 60_000;
  return Math.max(0, startUtc - now);
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function whenLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${formatTime(time)}`;
}

function MiniMap({ hall, tables, mine }: { hall: Hall | null; tables: DiningTable[]; mine: Set<number> }) {
  if (!hall || tables.length === 0) return null;
  const room = hallPlanSize(hall);
  const unit = planUnits(room.w);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const myTable = tables.find((t) => mine.has(t.id));
  return (
    <div
      className="relative min-h-[220px] bg-[#181210] bg-[radial-gradient(#2c2220_1px,transparent_1px)] bg-[length:14px_14px] p-4"
      aria-label={myTable ? `Ваш стол ${myTable.label} на схеме зала` : "Схема зала"}
      role="img"
    >
      <div className="relative w-full [container-type:inline-size]" style={{ aspectRatio: `${room.w} / ${room.h}` }}>
        {tables.map((t, i) => {
          const size = tableSize(t.shape, t.max_capacity);
          const isMine = mine.has(t.id);
          return (
            <span
              key={t.id}
              className={`absolute flex items-center justify-center border font-mono animate-[fp-pop_.5s_cubic-bezier(.3,1.5,.5,1)_both] ${
                isMine
                  ? "z-[2] border-claret bg-claret font-bold text-on-accent before:absolute before:-inset-1.5 before:animate-[gp-ripple_2s_ease-out_infinite] before:rounded-[inherit] before:border-2 before:border-claret"
                  : "border-line-strong bg-surface-raised text-[#8f7c75]"
              }`}
              style={{
                left: pct(t.pos_x, room.w),
                top: pct(t.pos_y, room.h),
                width: unit(size.w),
                height: unit(size.h),
                transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg)`,
                borderRadius: t.shape === "round" ? "50%" : unit(12),
                fontSize: `max(8px, ${unit(18)})`,
                animationDelay: `${100 + i * 50}ms`,
              }}
            >
              <span style={{ transform: `rotate(${-(t.rotation ?? 0)}deg)` }}>{t.label}</span>
            </span>
          );
        })}
        {myTable && (
          <span
            className="absolute z-[3] animate-[gp-drop_.8s_.4s_cubic-bezier(.3,1.6,.5,1)_both] text-claret"
            style={{
              left: pct(myTable.pos_x, room.w),
              top: pct(myTable.pos_y - tableSize(myTable.shape, myTable.max_capacity).h / 2, room.h),
              transform: "translate(-50%, -100%)",
            }}
            aria-hidden="true"
          >
            <svg width="22" height="28" viewBox="0 0 24 30" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.2 0 11.6 0 20 12 30 12 30s12-10 12-18.4C24 5.2 18.6 0 12 0zm0 16a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
            </svg>
          </span>
        )}
      </div>
      <span className="absolute bottom-3 left-3.5 font-mono text-[10px] tracking-[0.16em] text-[#8f7c75]">ВАШ СТОЛ НА СХЕМЕ</span>
    </div>
  );
}

/** An upcoming booking as a ticket: status, when and where, a live
 * countdown, the booking code, a mini map of the hall with the guest's table
 * pinned, and an inline cancel-with-reason box. */
export function BookingTicket({
  reservation,
  hall,
  hallTables,
  onCancel,
}: {
  reservation: TicketReservation;
  hall: Hall | null;
  hallTables: DiningTable[];
  onCancel: (reason: string | null) => Promise<void>;
}) {
  const now = useNow(30_000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = Math.floor(msUntil(reservation.date, reservation.start_time, now) / 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const confirmed = reservation.status === "confirmed";
  const tables =
    reservation.tableLabels.length > 1
      ? `столы ${reservation.tableLabels.join(", ")}`
      : `стол ${reservation.tableLabels[0] ?? "—"}`;

  async function confirmCancel() {
    setPending(true);
    setError(null);
    try {
      await onCancel(reason === OTHER_REASON ? otherText.trim() || null : reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <article className="relative grid animate-[gp-rise_.7s_cubic-bezier(.2,.9,.3,1.2)_both] overflow-hidden rounded-[26px] border border-line-strong bg-surface sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="relative flex flex-col gap-[18px] p-[26px] sm:after:absolute sm:after:bottom-5 sm:after:right-0 sm:after:top-5 sm:after:border-r-2 sm:after:border-dashed sm:after:border-line-strong">
          <span
            className={`inline-flex h-[26px] items-center gap-1.5 self-start rounded-full px-2.5 text-xs font-semibold ${
              confirmed ? "bg-status-confirmed-tint text-status-confirmed" : "bg-claret-tint text-claret"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${confirmed ? "" : "animate-breathe"}`} aria-hidden="true" />
            {confirmed ? "Подтверждена" : "Ждёт подтверждения"}
          </span>
          <div className="font-display text-[34px] leading-[1.05]">
            {whenLabel(reservation.date, reservation.start_time)}
            <small className="mt-1.5 block font-sans text-[13px] text-muted">
              {reservation.hallName || "Зал"} · {tables} · {guestsLabel(reservation.party_size)}
            </small>
          </div>
          <div className="flex gap-2" role="timer" aria-label={`До визита ${Math.floor(minutes / 1440)} дн ${Math.floor(minutes / 60) % 24} ч ${minutes % 60} мин`}>
            {[
              [pad(Math.floor(minutes / 1440)), "дн"],
              [pad(Math.floor(minutes / 60) % 24), "ч"],
              [pad(minutes % 60), "мин"],
            ].map(([value, label]) => (
              <div key={label} className="flex min-w-[62px] flex-col gap-0.5 rounded-[14px] border border-line-strong bg-[#261d1a] px-2 py-2.5 text-center" aria-hidden="true">
                <b className="font-mono text-[22px] font-medium">{value}</b>
                <small className="text-[10px] text-muted">{label}</small>
              </div>
            ))}
          </div>
          <div className="text-[13px] text-muted">
            Код брони <b className="font-semibold text-ink">TF-{reservation.id}</b>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setCancelOpen((v) => !v)}
              aria-expanded={cancelOpen}
              className={`${GHOST} text-status-cancelled hover:border-status-cancelled hover:bg-status-cancelled-tint`}
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Отменить
            </button>
          </div>
        </div>
        <MiniMap hall={hall} tables={hallTables} mine={new Set(reservation.tableIds)} />
      </article>

      {cancelOpen && (
        <div className="flex animate-[gp-open_.45s_cubic-bezier(.2,.9,.3,1.2)_both] flex-col gap-3 rounded-[18px] border border-[#4a2a26] bg-[#221816] p-4">
          <b className="text-sm">Почему отменяете? Это поможет ресторану</b>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Причина отмены">
            {[...GUEST_CANCELLATION_REASONS, OTHER_REASON].map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason((current) => (current === r ? null : r))}
                className={`${GHOST} h-auto min-h-11 py-2 text-left ${reason === r ? "border-claret bg-claret-tint text-claret hover:border-claret hover:bg-claret-tint" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === OTHER_REASON && (
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Расскажите, что случилось"
              aria-label="Причина отмены"
              className="w-full rounded-[13px] border border-line-strong bg-[#1a1311] px-3.5 py-2.5 text-sm outline-none focus:border-claret"
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-status-cancelled">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={confirmCancel}
              className="inline-flex h-11 items-center rounded-[13px] bg-status-cancelled px-[18px] text-sm font-bold text-on-accent transition-transform duration-200 hover:-translate-y-px disabled:opacity-60"
            >
              {pending ? "Отменяем…" : "Отменить бронь"}
            </button>
            <button type="button" disabled={pending} onClick={() => setCancelOpen(false)} className={GHOST}>
              Оставить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

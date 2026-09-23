"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Clock } from "lucide-react";

/** Time picker for the booking flow: a draggable slider along the day's
 * candidate start times (from `candidateStartTimes()` - whatever interval
 * the project's own slot logic generates, currently 90 minutes) rather than
 * a row of buttons. Taken/unavailable stops render dimmed and unreachable;
 * dragging always snaps to the nearest still-available stop, matching a tap
 * on that stop directly. Needs a table picked first (the availability data
 * is keyed by table), so it carries its own prompt/empty states. */
export function TimeSlider({
  hasSelectedTable,
  times,
  availableTimes,
  value,
  onChange,
}: {
  hasSelectedTable: boolean;
  times: string[];
  availableTimes: Set<string>;
  value: string | null;
  onChange: (time: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const stops = useMemo(
    () => times.map((t, i) => ({ time: t, pct: times.length > 1 ? (i / (times.length - 1)) * 100 : 0 })),
    [times]
  );

  function nearestAvailableIndex(pct: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    stops.forEach((s, i) => {
      if (!availableTimes.has(s.time)) return;
      const dist = Math.abs(s.pct - pct);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    return best;
  }

  function handlePointer(e: React.PointerEvent) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const idx = nearestAvailableIndex(pct);
    if (idx !== null) onChange(stops[idx].time);
  }

  if (!hasSelectedTable) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-sm text-muted">
        <Clock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Сначала выберите стол — тогда покажем свободное время.
      </p>
    );
  }

  const hasAvailable = stops.some((s) => availableTimes.has(s.time));
  if (!hasAvailable) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3.5 text-center text-sm text-muted">
        На эту дату для этого стола свободного времени нет. Попробуйте другую дату.
      </p>
    );
  }

  const selectedStop = value ? stops.find((s) => s.time === value) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={value ?? "none"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="font-display text-3xl text-ink tabular-nums"
          >
            {value ? value.slice(0, 5) : "—:—"}
          </motion.span>
        </AnimatePresence>
        {!value && <span className="text-sm text-muted">потяните ползунок</span>}
      </div>

      <div
        ref={trackRef}
        className="relative h-11 touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging) handlePointer(e);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        {selectedStop && (
          <motion.div
            aria-hidden="true"
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-claret/70"
            style={{ left: 0 }}
            animate={{ width: `${selectedStop.pct}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        {stops.map((s) => {
          const available = availableTimes.has(s.time);
          return (
            <button
              key={s.time}
              type="button"
              disabled={!available}
              aria-label={`${s.time.slice(0, 5)}${available ? "" : " — занято"}`}
              onClick={() => available && onChange(s.time)}
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[background-color,transform] duration-150 ${
                available ? "bg-claret/35 hover:scale-125" : "cursor-not-allowed bg-line bg-[repeating-linear-gradient(135deg,var(--color-muted)_0,var(--color-muted)_1px,transparent_1px,transparent_3px)] opacity-60"
              }`}
              style={{ left: `${s.pct}%` }}
            />
          );
        })}
        {selectedStop && (
          <motion.div
            aria-hidden="true"
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-claret bg-surface shadow-[var(--shadow-elevated)]"
            style={{ left: 0 }}
            animate={{ left: `${selectedStop.pct}%` }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          />
        )}
      </div>

      <div className="flex justify-between text-[11px] tabular-nums text-muted">
        {stops.map((s) => (
          <span key={s.time} className={availableTimes.has(s.time) ? "" : "opacity-40"}>
            {s.time.slice(0, 5)}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";

/** Discrete-stop slider (one stop per bookable start time) instead of a
 * dropdown/checkbox list. Unavailable stops are dimmed and unreachable -
 * dragging always snaps to the nearest still-available time. */
export function TimeSlider({
  times,
  availableTimes,
  value,
  onChange,
}: {
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

  const hasAvailable = stops.some((s) => availableTimes.has(s.time));
  const selectedStop = value ? stops.find((s) => s.time === value) : undefined;

  if (!hasAvailable) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        На эту дату для этого стола свободного времени нет. Попробуйте другую дату.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
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
                available ? "bg-claret/35 hover:scale-125" : "cursor-not-allowed bg-line"
              }`}
              style={{ left: `${s.pct}%` }}
            />
          );
        })}
        {selectedStop && (
          <div
            aria-hidden="true"
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-claret bg-surface shadow-md transition-[left] duration-150 ease-out"
            style={{ left: `${selectedStop.pct}%` }}
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

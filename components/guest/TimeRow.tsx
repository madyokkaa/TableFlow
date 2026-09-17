"use client";

import { motion } from "motion/react";
import { Clock } from "lucide-react";

/** Time half of the same scaling-row mechanic as TableRow - one chip per
 * candidate start time, scaling (never scrolling) to hold every slot in one
 * row down to a real phone width; wrapping is a fallback for genuinely
 * narrow screens, not the default. Needs a table picked first (the
 * availability data is keyed by table), so it carries its own prompt/empty
 * states instead of just being blank. */
export function TimeRow({
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
  if (!hasSelectedTable) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-sm text-muted">
        <Clock className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Сначала выберите стол — тогда покажем свободное время.
      </p>
    );
  }

  const hasAvailable = times.some((t) => availableTimes.has(t));
  if (!hasAvailable) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3.5 text-center text-sm text-muted">
        На эту дату для этого стола свободного времени нет. Попробуйте другую дату.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Время">
      {times.map((time) => {
        const available = availableTimes.has(time);
        const selected = value === time;
        return (
          <motion.button
            key={time}
            type="button"
            disabled={!available}
            aria-pressed={selected}
            onClick={() => available && onChange(time)}
            whileHover={available ? { y: -2 } : undefined}
            whileTap={available ? { scale: 0.96 } : undefined}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            className={`min-w-[44px] flex-1 basis-[44px] rounded-xl border-2 px-1 py-2 text-center font-mono text-xs tabular-nums transition-[background-color,border-color,box-shadow,opacity] duration-200 ${
              selected
                ? "border-claret bg-claret text-white shadow-[var(--shadow-elevated)]"
                : available
                  ? "border-line bg-surface text-ink hover:border-claret hover:shadow-[var(--shadow-soft)]"
                  : "cursor-not-allowed border-line text-muted opacity-40"
            }`}
          >
            {time.slice(0, 5)}
          </motion.button>
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import type { DiningTable } from "@/components/hostess/TableForm";

/** The tables-row half of the booking surface's signature interaction: every
 * table in the active hall renders as one chip in a row that scales to fill
 * the container width (flex-grow) rather than scrolling - never a carousel.
 * The chip floor (52px) is sized to hold a real demo hall's worth of tables
 * (ten) in one row at the surface's own content width (672px); wrapping to a
 * second line only kicks in as a fallback below that, on genuinely narrow
 * phones. Selecting a chip here and tapping the matching shape on the floor
 * plan above are the same action. */
export function TableRow({
  tables,
  partySize,
  selectedTableId,
  unavailableTableIds,
  onSelectTable,
}: {
  tables: DiningTable[];
  partySize: number;
  selectedTableId: number | null;
  unavailableTableIds: Set<number>;
  onSelectTable: (table: DiningTable) => void;
}) {
  if (tables.length === 0) {
    return <p className="text-sm text-muted">В этом зале пока нет столов.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Столы">
      {tables.map((table) => {
        const tooSmall = table.max_capacity < partySize;
        const noAvailability = unavailableTableIds.has(table.id);
        const disabled = tooSmall || noAvailability;
        const selected = table.id === selectedTableId;
        return (
          <motion.button
            key={table.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelectTable(table)}
            whileHover={disabled ? undefined : { y: -2 }}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            className={`flex min-w-[52px] flex-1 basis-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-2 text-center transition-[background-color,border-color,box-shadow,opacity] duration-200 ${
              selected
                ? "border-claret bg-claret text-white shadow-[var(--shadow-elevated)]"
                : disabled
                  ? "cursor-not-allowed border-line text-muted opacity-40"
                  : "border-line bg-surface text-ink hover:border-claret hover:shadow-[var(--shadow-soft)]"
            }`}
            title={
              tooSmall
                ? `Стол ${table.label}: максимум ${table.max_capacity} чел.`
                : noAvailability
                  ? `Стол ${table.label}: нет свободного времени на эту дату`
                  : `Стол ${table.label}`
            }
          >
            <span className="font-mono text-sm font-medium">{table.label}</span>
            <span className={`whitespace-nowrap text-[9px] tabular-nums ${selected ? "text-white/80" : "opacity-70"}`}>
              {table.min_capacity}–{table.max_capacity} мест
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { DatePicker } from "./DatePicker";
import { PartyStepper } from "./PartyStepper";
import type { DiningTable } from "@/components/hostess/TableForm";

/** The one persistent control strip across the whole booking surface - date,
 * party size, and the primary action never scroll out of reach. Inline
 * below the header on desktop; docked to the bottom of the viewport on
 * mobile (mirroring the hostess panel's own mobile tab bar), so the
 * scaling table/time rows above it always have a fixed, known-height
 * neighbour rather than competing for scroll space. */
export function BookingSummaryBar({
  date,
  minDate,
  maxDate,
  onDateChange,
  partySize,
  onPartySizeChange,
  selectedTable,
  selectedTime,
  onSubmit,
}: {
  date: string;
  minDate: string;
  maxDate: string;
  onDateChange: (date: string) => void;
  partySize: number;
  onPartySizeChange: (value: number) => void;
  selectedTable: DiningTable | null;
  selectedTime: string | null;
  onSubmit: () => void;
}) {
  const ready = Boolean(selectedTable && selectedTime);
  const ctaLabel = !selectedTable ? "Выберите стол" : !selectedTime ? "Выберите время" : "Забронировать";

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-xl sm:static sm:z-auto sm:rounded-2xl sm:border sm:bg-surface sm:px-5 sm:py-4 sm:shadow-[var(--shadow-soft)] sm:backdrop-blur-none">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-3">
        <div className="min-w-[160px] flex-1 sm:max-w-[240px]">
          <DatePicker value={date} minDate={minDate} maxDate={maxDate} onChange={onDateChange} />
        </div>
        <PartyStepper value={partySize} onChange={onPartySizeChange} />
        <div className="ml-auto flex items-center gap-3">
          {ready && (
            <span className="hidden font-mono text-sm text-muted sm:inline">
              Стол {selectedTable!.label} · {selectedTime!.slice(0, 5)}
            </span>
          )}
          <motion.button
            type="button"
            disabled={!ready}
            onClick={onSubmit}
            whileHover={ready ? { scale: 1.03 } : undefined}
            whileTap={ready ? { scale: 0.96 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-claret px-5 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-claret-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ctaLabel}
            {ready && <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { DiningTable } from "@/components/hostess/TableForm";
import { capacityText, guestTableState } from "./GuestFloorPlan";

/** "Или выберите из списка": the same tables as the plan, as compact chips -
 * for keyboard users, small screens, and anyone who'd rather not hunt on
 * the plan. States mirror the plan exactly. */
export function TableRow({
  tables,
  partySize,
  selectedTableId,
  availableTableIds,
  onSelectTable,
}: {
  tables: DiningTable[];
  partySize: number;
  selectedTableId: number | null;
  availableTableIds: Set<number> | null;
  onSelectTable: (table: DiningTable) => void;
}) {
  if (tables.length === 0) return null;
  const sorted = [...tables].sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true }));

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Или выберите из списка</span>
      <div className="flex flex-wrap gap-2">
        {sorted.map((table) => {
          const state = guestTableState(table, partySize, selectedTableId, availableTableIds);
          const disabled = state === "booked" || state === "small";
          const cap = capacityText(table);
          return (
            <button
              key={table.id}
              type="button"
              aria-pressed={state === "sel"}
              aria-disabled={disabled}
              aria-label={`Стол ${table.label}, ${cap}${
                state === "booked" ? ", занят" : state === "small" ? ", мало мест" : state === "sel" ? ", выбран" : ", свободен"
              }`}
              onClick={() => {
                if (!disabled) onSelectTable(table);
              }}
              className={`flex h-12 min-w-14 flex-col items-center justify-center gap-px rounded-xl border px-2.5 transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
                state === "sel"
                  ? "border-claret bg-claret text-on-accent"
                  : disabled
                    ? "cursor-not-allowed border-line-strong bg-[#1a1311] opacity-40"
                    : "border-line-strong bg-[#1a1311] hover:-translate-y-[3px] hover:border-[#8a6a62]"
              }`}
            >
              <b className="font-display text-base font-normal leading-none">{table.label}</b>
              <span className={`font-mono text-[9px] ${state === "sel" ? "text-[#5a2333]" : "text-muted"}`}>
                {table.min_capacity === table.max_capacity ? table.max_capacity : `${table.min_capacity}–${table.max_capacity}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

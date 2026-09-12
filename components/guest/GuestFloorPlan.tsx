"use client";

import { useMemo, useState } from "react";
import { SHAPE_SIZE } from "@/lib/tableShapes";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

/** Read-only floor plan for guests: no drag, capacity-based dimming only.
 * Real occupied/free status depends on the date+time chosen in later steps,
 * so it isn't knowable yet here - that's the time slider's job. */
export function GuestFloorPlan({
  halls,
  tables,
  partySize,
  selectedTableId,
  onSelectTable,
}: {
  halls: Hall[];
  tables: DiningTable[];
  partySize: number;
  selectedTableId: number | null;
  onSelectTable: (table: DiningTable) => void;
}) {
  const [activeHallId, setActiveHallId] = useState<number | null>(halls[0]?.id ?? null);

  const bookableTables = useMemo(
    () => tables.filter((t) => t.is_active && t.manual_status !== "out_of_service"),
    [tables]
  );
  const visibleTables = useMemo(
    () => bookableTables.filter((t) => t.hall_id === activeHallId),
    [bookableTables, activeHallId]
  );

  return (
    <div className="flex flex-col gap-3">
      {halls.length > 1 && (
        <div className="flex gap-1.5" role="tablist" aria-label="Зал">
          {halls.map((h) => (
            <button
              key={h.id}
              type="button"
              role="tab"
              aria-selected={activeHallId === h.id}
              onClick={() => setActiveHallId(h.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                activeHallId === h.id ? "bg-claret-tint text-claret" : "text-muted hover:text-ink"
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <div
          className="relative h-[420px] min-w-[640px]"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {visibleTables.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              В этом зале пока нет доступных столов.
            </p>
          )}
          {visibleTables.map((table) => {
            const size = SHAPE_SIZE[table.shape];
            const tooSmall = table.max_capacity < partySize;
            const selected = table.id === selectedTableId;
            return (
              <button
                key={table.id}
                type="button"
                disabled={tooSmall}
                aria-pressed={selected}
                onClick={() => onSelectTable(table)}
                className={`absolute flex touch-none flex-col items-center justify-center border-2 text-center transition-[background-color,border-color,box-shadow,opacity] duration-200 ${size.className} ${
                  selected
                    ? "border-claret bg-claret text-white shadow-lg"
                    : tooSmall
                      ? "cursor-not-allowed border-line text-muted opacity-40"
                      : "border-line bg-surface text-ink hover:border-claret hover:shadow-md"
                }`}
                style={{ width: size.w, height: size.h, left: table.pos_x, top: table.pos_y }}
                title={tooSmall ? `Стол ${table.label}: максимум ${table.max_capacity} чел.` : `Стол ${table.label}`}
              >
                <span className="font-mono text-sm font-medium">{table.label}</span>
                <span className={`text-[10px] tabular-nums ${selected ? "text-white/80" : "opacity-70"}`}>
                  {table.min_capacity}–{table.max_capacity} мест
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-line bg-surface" aria-hidden="true" />
          Свободен
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-claret bg-claret" aria-hidden="true" />
          Выбран
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-line bg-surface opacity-40" aria-hidden="true" />
          Мало мест
        </span>
      </div>
    </div>
  );
}

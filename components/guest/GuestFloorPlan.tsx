"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { SHAPE_SIZE } from "@/lib/tableShapes";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

const PADDING = 32;

/** Read-only floor plan for guests: the whole room renders at once, scaled
 * to fit its container via the SVG viewBox's native "zoom to fit" behaviour
 * (preserveAspectRatio) - never a fixed canvas that scrolls sideways. Real
 * occupied/free status depends on the date+time chosen alongside this, so a
 * table with zero availability for the current date/party size is dimmed
 * (via `unavailableTableIds`) rather than removed - the room stays legible
 * as a whole. Hall selection is controlled by the parent so the table row
 * beneath it can filter to the same set. */
export function GuestFloorPlan({
  halls,
  activeHallId,
  onHallChange,
  visibleTables,
  partySize,
  selectedTableId,
  unavailableTableIds,
  onSelectTable,
}: {
  halls: Hall[];
  activeHallId: number | null;
  onHallChange: (hallId: number) => void;
  visibleTables: DiningTable[];
  partySize: number;
  selectedTableId: number | null;
  unavailableTableIds: Set<number>;
  onSelectTable: (table: DiningTable) => void;
}) {
  const viewBox = useMemo(() => {
    if (visibleTables.length === 0) return { minX: 0, minY: 0, width: 640, height: 360 };
    let maxX = 0;
    let maxY = 0;
    for (const t of visibleTables) {
      const size = SHAPE_SIZE[t.shape];
      maxX = Math.max(maxX, t.pos_x + size.w);
      maxY = Math.max(maxY, t.pos_y + size.h);
    }
    return { minX: 0, minY: 0, width: maxX + PADDING, height: maxY + PADDING };
  }, [visibleTables]);

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
              onClick={() => onHallChange(h.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                activeHallId === h.id ? "bg-claret-tint text-claret" : "text-muted hover:text-ink"
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-2xl border border-line bg-paper"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {visibleTables.length === 0 ? (
          <p className="flex h-48 items-center justify-center text-sm text-muted">
            В этом зале пока нет доступных столов.
          </p>
        ) : (
          <svg
            viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
            className="block max-h-[min(60svh,480px)] w-full"
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label="Схема зала"
          >
            {visibleTables.map((table) => {
              const size = SHAPE_SIZE[table.shape];
              const tooSmall = table.max_capacity < partySize;
              const noAvailability = unavailableTableIds.has(table.id);
              const disabled = tooSmall || noAvailability;
              const selected = table.id === selectedTableId;
              return (
                <foreignObject key={table.id} x={table.pos_x} y={table.pos_y} width={size.w} height={size.h}>
                  <div className="h-full w-full">
                    <motion.button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => onSelectTable(table)}
                      whileHover={disabled ? undefined : { scale: 1.06 }}
                      whileTap={disabled ? undefined : { scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 380, damping: 18 }}
                      className={`flex h-full w-full touch-none flex-col items-center justify-center border-2 text-center transition-[background-color,border-color,box-shadow,opacity] duration-200 ${size.className} ${
                        selected
                          ? "border-claret bg-claret text-white shadow-lg"
                          : disabled
                            ? "cursor-not-allowed border-line text-muted opacity-40"
                            : "border-line bg-surface text-ink hover:border-claret hover:shadow-md"
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
                      <span className={`text-[10px] tabular-nums ${selected ? "text-white/80" : "opacity-70"}`}>
                        {table.min_capacity}–{table.max_capacity} мест
                      </span>
                    </motion.button>
                  </div>
                </foreignObject>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
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
          Недоступен
        </span>
      </div>
    </div>
  );
}

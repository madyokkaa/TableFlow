"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { tableSize } from "@/lib/tableShapes";
import { hallPlanSize, rotatedSize } from "@/lib/floorPlan";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

/** On-plan footprint of a table once rotated, in plan units. */
function tableBox(table: DiningTable): { w: number; h: number } {
  const size = tableSize(table.shape, table.max_capacity);
  return rotatedSize(size.w, size.h, table.rotation ?? 0);
}

const PADDING = 32;

// A table's hover/selected feedback scales the button up 6% via a CSS
// transform (motion's whileHover/whileTap). Its `<foreignObject>` box is a
// literal pixel rect in SVG space, though, and doesn't grow with it - the
// scaled-up button used to render larger than that box, sticking out past
// its cell (most visible on rectangular tables, whose straight edges cross
// the neighbouring grid lines; round tables hid the same overflow better).
// Padding every table's foreignObject (and the viewBox itself, so edge
// tables don't hit the SVG's own boundary) by more than the scale growth
// needs gives the animation room to happen without ever exceeding its cell.
const TABLE_HOVER_PAD = 6;

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
  const activeHall = halls.find((h) => h.id === activeHallId);
  const viewBox = useMemo(() => {
    if (visibleTables.length === 0) return { minX: 0, minY: 0, width: 640, height: 360 };
    // Positions are table centres in plan units (lib/floorPlan.ts). Fit the
    // view to the tables actually present, but never past the room itself.
    const room = activeHall ? hallPlanSize(activeHall) : null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;
    for (const t of visibleTables) {
      const size = tableBox(t);
      minX = Math.min(minX, t.pos_x - size.w / 2);
      minY = Math.min(minY, t.pos_y - size.h / 2);
      maxX = Math.max(maxX, t.pos_x + size.w / 2);
      maxY = Math.max(maxY, t.pos_y + size.h / 2);
    }
    const left = Math.max(room ? 0 : -Infinity, minX - PADDING) - TABLE_HOVER_PAD;
    const top = Math.max(room ? 0 : -Infinity, minY - PADDING) - TABLE_HOVER_PAD;
    const right = Math.min(room ? room.w : Infinity, maxX + PADDING) + TABLE_HOVER_PAD;
    const bottom = Math.min(room ? room.h : Infinity, maxY + PADDING) + TABLE_HOVER_PAD;
    return { minX: left, minY: top, width: right - left, height: bottom - top };
  }, [visibleTables, activeHall]);

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
              const box = tableBox(table);
              const top = tableSize(table.shape, table.max_capacity);
              const rotation = table.rotation ?? 0;
              const tooSmall = table.max_capacity < partySize;
              const noAvailability = unavailableTableIds.has(table.id);
              const disabled = tooSmall || noAvailability;
              const selected = table.id === selectedTableId;
              return (
                <foreignObject
                  key={table.id}
                  x={table.pos_x - box.w / 2 - TABLE_HOVER_PAD}
                  y={table.pos_y - box.h / 2 - TABLE_HOVER_PAD}
                  width={box.w + TABLE_HOVER_PAD * 2}
                  height={box.h + TABLE_HOVER_PAD * 2}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <motion.button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => onSelectTable(table)}
                      whileHover={disabled ? undefined : { scale: 1.06 }}
                      whileTap={disabled ? undefined : { scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 380, damping: 18 }}
                      style={{
                        width: top.w,
                        height: top.h,
                        rotate: `${rotation}deg`,
                        // Finite radius rather than rounded-full - see tableShapes history:
                        // a near-infinite radius under nested scale transforms rasterizes badly.
                        borderRadius: table.shape === "round" ? top.w / 2 : 12,
                      }}
                      className={`flex touch-none flex-col items-center justify-center border-2 text-center transition-[background-color,border-color,box-shadow,opacity] duration-200 ${
                        selected
                          ? "border-claret bg-claret text-on-accent shadow-lg"
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
                      <span className={`text-[10px] tabular-nums ${selected ? "text-on-accent/80" : "opacity-70"}`}>
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

"use client";

import type { CSSProperties } from "react";
import { HALL_OBJECT_META, hallPlanSize, rotatedSize, type HallObject } from "@/lib/floorPlan";
import { SEAT_SIZE, seatPlacements, tableSize } from "@/lib/tableShapes";
import { guestsLabel, pluralize } from "@/lib/ru";
import { ObjectArtwork, floorStyle, objectFontSize, planUnits } from "@/components/floor-plan/PlanShapes";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

const TAB_WIDTH = 150;

export type GuestTableState = "free" | "sel" | "booked" | "small";

export function guestTableState(
  table: DiningTable,
  partySize: number,
  selectedTableId: number | null,
  availableTableIds: Set<number> | null
): GuestTableState {
  if (table.max_capacity < partySize) return "small";
  if (availableTableIds && !availableTableIds.has(table.id)) return "booked";
  return table.id === selectedTableId ? "sel" : "free";
}

export function capacityText(table: Pick<DiningTable, "min_capacity" | "max_capacity">): string {
  const word = pluralize(table.max_capacity, "место", "места", "мест");
  return table.min_capacity === table.max_capacity
    ? `${table.max_capacity} ${word}`
    : `${table.min_capacity}–${table.max_capacity} ${word}`;
}

/** The guest's floor plan: hall tabs, a legend, and the room drawn to the
 * same real scale as the staff editor - tables with chairs that slide out
 * on hover, booked tables hatched, tables too small for the party dimmed,
 * and the hall's fixed objects (bar, entrance…) shown for orientation. */
export function GuestFloorPlan({
  halls,
  activeHallId,
  onHallChange,
  tables,
  objects,
  freeCountByHall,
  partySize,
  selectedTableId,
  availableTableIds,
  onSelectTable,
}: {
  halls: Hall[];
  activeHallId: number | null;
  onHallChange: (hallId: number) => void;
  tables: DiningTable[];
  objects: HallObject[];
  freeCountByHall: Map<number, number>;
  partySize: number;
  selectedTableId: number | null;
  /** null while availability is still loading - nothing is shown as booked yet. */
  availableTableIds: Set<number> | null;
  onSelectTable: (table: DiningTable) => void;
}) {
  const hall = halls.find((h) => h.id === activeHallId) ?? null;
  const activeIndex = Math.max(
    0,
    halls.findIndex((h) => h.id === activeHallId)
  );
  const room = hallPlanSize(hall ?? {});
  const unit = planUnits(room.w);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {halls.length > 0 && (
          <div className="max-w-full overflow-x-auto">
            <div
              role="tablist"
              aria-label="Зал"
              className="relative inline-flex rounded-[14px] border border-line-strong bg-[#1a1311] p-1"
            >
              <span
                aria-hidden="true"
                className="absolute left-1 top-1 h-11 rounded-[10px] bg-claret shadow-[0_8px_24px_-10px_var(--color-claret)] transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
                style={{ width: TAB_WIDTH, transform: `translateX(${activeIndex * TAB_WIDTH}px)` }}
              />
              {halls.map((h) => {
                const selected = h.id === activeHallId;
                const free = freeCountByHall.get(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onHallChange(h.id)}
                    style={{ width: TAB_WIDTH }}
                    className={`relative z-[1] flex h-11 flex-col items-center justify-center rounded-[10px] px-2 text-sm font-semibold leading-tight transition-colors duration-300 ${
                      selected ? "text-on-accent" : "text-muted hover:text-ink"
                    }`}
                  >
                    <span className="max-w-full truncate">{h.name}</span>
                    {free !== undefined && (
                      <small className="font-mono text-[10px] font-normal opacity-80">{free} свободно</small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-[18px] text-xs text-muted">
          <span className="inline-flex items-center gap-[7px]">
            <i className="block h-2.5 w-2.5 rounded-full bg-status-confirmed" aria-hidden="true" />
            Свободен
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <i className="block h-2.5 w-2.5 rounded-full bg-claret" aria-hidden="true" />
            Выбран
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <i className="block h-2.5 w-2.5 rounded-full border border-dashed border-[#8f7c75]" aria-hidden="true" />
            Занят
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[22px]">
        <div
          key={activeHallId ?? "none"}
          className="gp-plan"
          role="group"
          aria-label={hall ? `Схема зала «${hall.name}»` : "Схема зала"}
          style={{ aspectRatio: `${room.w} / ${room.h}`, ...floorStyle(hall?.floor ?? "wood", room.w, room.h, false) }}
        >
          {objects.map((o) => (
            <span
              key={o.id}
              aria-hidden="true"
              className={`fp-obj fp-static k-${o.kind}`}
              style={{
                left: pct(o.pos_x, room.w),
                top: pct(o.pos_y, room.h),
                width: unit(o.width),
                height: unit(o.height),
                transform: `translate(-50%, -50%) rotate(${o.rotation ?? 0}deg)`,
                fontSize: objectFontSize(o.width, o.height, unit),
              }}
              title={o.label || HALL_OBJECT_META[o.kind]?.name}
            >
              <ObjectArtwork label={o.label} />
            </span>
          ))}

          {tables.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              В этом зале пока нет доступных столов.
            </p>
          )}

          {tables.map((table, i) => {
            const state = guestTableState(table, partySize, selectedTableId, availableTableIds);
            const rotation = table.rotation ?? 0;
            const size = tableSize(table.shape, table.max_capacity);
            const box = rotatedSize(size.w, size.h, rotation);
            const cap = capacityText(table);
            const disabled = state === "booked" || state === "small";
            const tip =
              state === "booked"
                ? `Стол ${table.label} занят в этот день`
                : state === "small"
                  ? `Стол ${table.label} — до ${guestsLabel(table.max_capacity)}`
                  : `Стол ${table.label} · до ${guestsLabel(table.max_capacity)}`;
            return (
              <button
                key={table.id}
                type="button"
                className={`gp-tbl ${table.shape} ${state}`}
                style={{
                  left: pct(table.pos_x, room.w),
                  top: pct(table.pos_y, room.h),
                  width: unit(box.w),
                  height: unit(box.h),
                  transform: "translate(-50%, -50%)",
                }}
                aria-label={`Стол ${table.label}, ${cap}${
                  state === "booked" ? ", занят" : state === "small" ? ", мало мест" : state === "sel" ? ", выбран" : ", свободен"
                }`}
                aria-pressed={state === "sel"}
                aria-disabled={disabled}
                onClick={() => {
                  if (!disabled) onSelectTable(table);
                }}
              >
                <span
                  className="absolute left-1/2 top-1/2"
                  style={{ width: unit(size.w), height: unit(size.h), transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
                >
                  <span className="gp-in" style={{ animationDelay: `${60 + i * 60}ms` }}>
                    {seatPlacements(table.shape, table.max_capacity).map((seat, s) => (
                      <span
                        key={s}
                        className="fp-arm"
                        style={{ transform: `translate(${unit(seat.x)}, ${unit(seat.y)}) rotate(${seat.angle}deg)` }}
                      >
                        <span
                          className="gp-seat"
                          style={
                            {
                              width: unit(SEAT_SIZE.w),
                              height: unit(SEAT_SIZE.h),
                              left: unit(-SEAT_SIZE.w / 2),
                              top: unit(-SEAT_SIZE.h / 2),
                              "--d": unit(seat.distance),
                              "--push": unit(14),
                              transitionDelay: `${s * 40}ms`,
                            } as CSSProperties
                          }
                        />
                      </span>
                    ))}
                    <span className="gp-top">
                      <span className="gp-txt" style={{ transform: `rotate(${-rotation}deg)` }}>
                        <span className="gp-num" style={{ fontSize: `max(13px, ${unit(20)})` }}>
                          {table.label}
                        </span>
                        <span className="gp-cap" style={{ fontSize: `max(8px, ${unit(9)})` }}>
                          {table.min_capacity === table.max_capacity
                            ? table.max_capacity
                            : `${table.min_capacity}–${table.max_capacity}`}
                        </span>
                      </span>
                      <span className="gp-dot" aria-hidden="true" />
                    </span>
                    <span className="gp-ring" aria-hidden="true" />
                  </span>
                </span>
                <span className="gp-tip" aria-hidden="true">
                  {tip}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

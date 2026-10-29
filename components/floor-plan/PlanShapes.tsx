import type { CSSProperties, ReactNode } from "react";
import { GRID_CELL, type FloorType } from "@/lib/floorPlan";
import { SEAT_SIZE, seatPlacements, tableSize, type TableShape } from "@/lib/tableShapes";

/** Converts plan units into a CSS length. On a plan, sizes are `cqw` of the
 * plan's own width (the plan is `container-type: inline-size`), so they
 * scale with it; in a fixed-size preview they're plain px. */
export type UnitFn = (units: number) => string;

export function planUnits(planWidthUnits: number): UnitFn {
  const k = 100 / planWidthUnits;
  return (v) => `${Math.round(v * k * 1000) / 1000}cqw`;
}

export function pxUnits(scale: number): UnitFn {
  return (v) => `${Math.round(v * scale * 10) / 10}px`;
}

export type TableVisualState = "free" | "busy" | "off" | "hidden";

/** Seats + table top, to be placed inside a positioned `.fp-obj.fp-table`
 * element of the table's size (see tableSize). The number stays upright
 * whatever the table's rotation. */
export function TableArtwork({
  shape,
  maxCapacity,
  label,
  capacityText,
  rotation,
  unit,
  fixedFont = false,
  delayIndex = 0,
}: {
  shape: TableShape;
  maxCapacity: number;
  label: string;
  capacityText: string;
  rotation: number;
  unit: UnitFn;
  /** Previews use plain px; on a plan the text keeps a legible minimum. */
  fixedFont?: boolean;
  delayIndex?: number;
}) {
  const seats = seatPlacements(shape, maxCapacity);
  return (
    <>
      {seats.map((seat, i) => (
        <span
          key={i}
          className="fp-arm"
          style={{ transform: `translate(${unit(seat.x)}, ${unit(seat.y)}) rotate(${seat.angle}deg)` }}
        >
          <span
            className="fp-seat"
            style={{
              width: unit(SEAT_SIZE.w),
              height: unit(SEAT_SIZE.h),
              left: unit(-SEAT_SIZE.w / 2),
              top: unit(-SEAT_SIZE.h / 2),
              transform: `translateY(${unit(-seat.distance)})`,
              animationDelay: `${i * 35}ms`,
            }}
          />
        </span>
      ))}
      <span className="fp-top" style={{ animationDelay: `${delayIndex * 40}ms` }}>
        <span className="fp-txt" style={{ transform: `rotate(${-rotation}deg)` }}>
          <span className="fp-num" style={{ fontSize: fixedFont ? unit(20) : `max(10px, ${unit(20)})` }}>
            {label}
          </span>
          <span className="fp-cap" style={{ fontSize: fixedFont ? unit(10) : `max(7px, ${unit(10)})` }}>
            {capacityText}
          </span>
        </span>
      </span>
    </>
  );
}

export function tableCapacityText(min: number, max: number): string {
  return min === max ? String(max) : `${min}–${max}`;
}

export function tableBoxStyle(shape: TableShape, maxCapacity: number, unit: UnitFn): { width: string; height: string } {
  const size = tableSize(shape, maxCapacity);
  return { width: unit(size.w), height: unit(size.h) };
}

/** On-plan caption size for a hall object - proportional to its smaller
 * side, clamped to stay legible. */
export function objectFontSize(w: number, h: number, unit: UnitFn): string {
  return `max(8px, ${unit(Math.min(16, Math.max(9, Math.min(w, h) * 0.32)))})`;
}

export function ObjectArtwork({ label }: { label?: ReactNode }) {
  return (
    <>
      <span className="fp-dk" />
      {label ? <span className="fp-label">{label}</span> : null}
    </>
  );
}

const FLOOR_COLORS: Record<FloorType, string> = { wood: "#1d1512", tile: "#191513", concrete: "#1a1817" };

/** Background for a plan: the floor finish, plus the 50 cm grid (with a
 * fainter 25 cm sub-grid) when `grid` is on. Grid cells are a fraction of
 * the plan, so they stay true to scale at any zoom. */
export function floorStyle(floor: FloorType, planW: number, planH: number, grid: boolean): CSSProperties {
  const cols = planW / GRID_CELL;
  const rows = planH / GRID_CELL;
  const images: string[] = [];
  const sizes: string[] = [];
  if (grid) {
    images.push(
      "linear-gradient(#2c2220 1px, transparent 1px)",
      "linear-gradient(90deg, #2c2220 1px, transparent 1px)",
      "linear-gradient(#221a18 1px, transparent 1px)",
      "linear-gradient(90deg, #221a18 1px, transparent 1px)"
    );
    const cell = `calc(100% / ${cols}) calc(100% / ${rows})`;
    const half = `calc(100% / ${cols * 2}) calc(100% / ${rows * 2})`;
    sizes.push(cell, cell, half, half);
  }
  if (floor === "wood") {
    images.push(
      "linear-gradient(90deg, rgba(0,0,0,.28) 1px, transparent 1px)",
      "linear-gradient(rgba(255,255,255,.012) 50%, transparent 50%)"
    );
    sizes.push(`calc(100% / ${cols / 4}) 100%`, `100% calc(100% / ${rows / 2})`);
  } else if (floor === "tile") {
    images.push("conic-gradient(rgba(255,255,255,.03) 25%, transparent 0 50%, rgba(255,255,255,.03) 0 75%, transparent 0)");
    sizes.push(`calc(100% / ${cols / 2}) calc(100% / ${rows / 2})`);
  } else {
    images.push("radial-gradient(rgba(255,255,255,.035) 1px, transparent 1.4px)");
    sizes.push("9px 9px");
  }
  return {
    backgroundColor: FLOOR_COLORS[floor] ?? FLOOR_COLORS.wood,
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
  };
}

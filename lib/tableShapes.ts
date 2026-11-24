/** Table geometry shared by the staff floor-plan editor and the guest
 * booking plan, so a table's footprint and chairs never drift between the
 * two. All sizes are in plan units (80 = 1 m, 40 = one 50 cm grid cell) -
 * see lib/floorPlan.ts for the coordinate system. */

export type TableShape = "rectangle" | "round" | "square";

export const TABLE_SHAPES: TableShape[] = ["rectangle", "round", "square"];

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  rectangle: "Прямоугольный",
  round: "Круглый",
  square: "Квадратный",
};

/** Table-top size from its shape and how many people it seats:
 * round ≤2 → ⌀60 (75 cm), ≤4 → 80, ≤6 → 100, else 120;
 * square ≤4 → 80, ≤8 → 100, else 120;
 * rectangle 40 per pair of seats along the long side + 40, by 60 deep. */
export function tableSize(shape: TableShape, maxCapacity: number): { w: number; h: number } {
  const max = Math.max(1, maxCapacity);
  if (shape === "round") {
    const d = max <= 2 ? 60 : max <= 4 ? 80 : max <= 6 ? 100 : 120;
    return { w: d, h: d };
  }
  if (shape === "square") {
    const s = max <= 4 ? 80 : max <= 8 ? 100 : 120;
    return { w: s, h: s };
  }
  return { w: 40 * Math.ceil(max / 2) + 40, h: 60 };
}

/** One chair around a table: start at the table's centre, shift by (x, y),
 * rotate by `angle` degrees, then push `distance` units outward (towards
 * negative y in the rotated frame). Chair angle 0 sits above the table. */
export type SeatPlacement = { x: number; y: number; angle: number; distance: number };

export const SEAT_SIZE = { w: 22, h: 13 };

export function seatPlacements(shape: TableShape, maxCapacity: number): SeatPlacement[] {
  const max = Math.max(1, maxCapacity);
  const size = tableSize(shape, max);
  const seats: SeatPlacement[] = [];

  if (shape === "round") {
    for (let i = 0; i < max; i++) {
      seats.push({ x: 0, y: 0, angle: (i * 360) / max + (max === 2 ? 90 : 0), distance: size.w / 2 + 10 });
    }
    return seats;
  }

  if (shape === "rectangle") {
    const top = Math.ceil(max / 2);
    const bottom = max - top;
    for (let i = 0; i < top; i++) seats.push({ x: (i - (top - 1) / 2) * 40, y: 0, angle: 0, distance: size.h / 2 + 10 });
    for (let i = 0; i < bottom; i++) {
      seats.push({ x: (i - (bottom - 1) / 2) * 40, y: 0, angle: 180, distance: size.h / 2 + 10 });
    }
    return seats;
  }

  // Square: deal chairs round the four sides in turn.
  const sides = [0, 180, 90, 270];
  const perSide = [0, 0, 0, 0];
  for (let i = 0; i < max; i++) perSide[i % 4] += 1;
  sides.forEach((side, s) => {
    const horizontal = side === 0 || side === 180;
    for (let j = 0; j < perSide[s]; j++) {
      const offset = (j - (perSide[s] - 1) / 2) * 30;
      seats.push({ x: horizontal ? offset : 0, y: horizontal ? 0 : offset, angle: side, distance: size.w / 2 + 10 });
    }
  });
  return seats;
}

/** "Круглый ⌀ 0,8 м" / "Прямоугольный 1,4 × 0,8 м" */
export function tableSizeCaption(shape: TableShape, maxCapacity: number, toMeters: (units: number) => string): string {
  const { w, h } = tableSize(shape, maxCapacity);
  if (shape === "round") return `Круглый ⌀ ${toMeters(w)} м`;
  return `${shape === "rectangle" ? "Прямоугольный" : "Квадратный"} ${toMeters(w)} × ${toMeters(h)} м`;
}

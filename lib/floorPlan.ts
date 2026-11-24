/** The floor plan's coordinate system and the rules every plan (staff
 * editor, guest booking plan, API validation) agrees on.
 *
 * Positions are the CENTRE of an object, in logical plan units:
 * 80 units = 1 m, 40 units = one 50 cm grid cell, 20 units = the 25 cm
 * snap step. A hall's plan spans width_m*80 by length_m*80 units. On screen
 * the plan is a container with aspect-ratio width/length and every size is
 * expressed relative to its width (cqw), so proportions hold at any window
 * size and zoom. */

import { tableSize, type TableShape } from "./tableShapes";

export const UNITS_PER_METER = 80;
export const GRID_CELL = 40; // 50 cm
export const SNAP_STEP = 20; // 25 cm
export const MAGNET_RADIUS = 16;
/** Tables keep this much clearance from walls and from other solid objects
 * (room for the chairs and to walk past). */
export const TABLE_CLEARANCE = 24;
export const TABLE_WALL_MARGIN = 16;

export const DEFAULT_HALL_WIDTH_M = 15;
export const DEFAULT_HALL_LENGTH_M = 8.5;
export const HALL_SIZE_MIN_M = 4;
export const HALL_SIZE_MAX_M = 40;

export const FLOOR_TYPES = ["wood", "tile", "concrete"] as const;
export type FloorType = (typeof FLOOR_TYPES)[number];
export const FLOOR_LABELS: Record<FloorType, string> = { wood: "Дерево", tile: "Плитка", concrete: "Бетон" };

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export function normalizeRotation(degrees: number): Rotation {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

export const HALL_OBJECT_KINDS = [
  "bar",
  "hostess",
  "entrance",
  "stairs",
  "kitchen",
  "wc",
  "stage",
  "sofa",
  "column",
  "plant",
  "window",
  "door",
  "wall",
  "rail",
] as const;
export type HallObjectKind = (typeof HALL_OBJECT_KINDS)[number];

/** Default footprint (plan units), whether it blocks tables, default
 * on-plan caption and the inspector hint for every object kind. */
export const HALL_OBJECT_META: Record<
  HallObjectKind,
  { name: string; w: number; h: number; solid: boolean; label: string; hint: string }
> = {
  bar: { name: "Барная стойка", w: 320, h: 80, solid: true, label: "Бар", hint: "Стулья рисуются с той стороны, где сидят гости. Поверните, чтобы развернуть стойку." },
  hostess: { name: "Стойка хостес", w: 100, h: 60, solid: true, label: "Хостес", hint: "Ставьте рядом со входом — так гостей встречают сразу." },
  entrance: { name: "Вход", w: 120, h: 20, solid: false, label: "Вход", hint: "Ставится вплотную к стене. Пунктир показывает, куда открывается дверь." },
  stairs: { name: "Лестница", w: 120, h: 200, solid: true, label: "", hint: "Стрелка показывает подъём. Поверните, чтобы изменить направление." },
  kitchen: { name: "Кухня", w: 240, h: 160, solid: true, label: "Кухня", hint: "Служебная зона — столы рядом с ней ставить нельзя." },
  wc: { name: "Санузел", w: 120, h: 120, solid: true, label: "WC", hint: "Служебное помещение." },
  stage: { name: "Сцена", w: 240, h: 140, solid: true, label: "Сцена", hint: "Для живой музыки и мероприятий." },
  sofa: { name: "Диван", w: 200, h: 60, solid: true, label: "", hint: "Мягкая зона у стены." },
  column: { name: "Колонна", w: 40, h: 40, solid: true, label: "", hint: "Несущая колонна — обходите её при расстановке." },
  plant: { name: "Растение", w: 60, h: 60, solid: true, label: "", hint: "Декор и зонирование." },
  window: { name: "Окно", w: 200, h: 12, solid: false, label: "", hint: "Ставится на стену. Столы у окна гости выбирают чаще." },
  door: { name: "Дверь", w: 80, h: 20, solid: false, label: "", hint: "Служебная или межкомнатная дверь." },
  wall: { name: "Стена", w: 240, h: 16, solid: true, label: "", hint: "Перегородка внутри зала." },
  rail: { name: "Перила", w: 400, h: 10, solid: false, label: "", hint: "Ограждение террасы или балкона." },
};

export const HALL_OBJECT_MAX_SIZE = 3200; // 40 m
export const HALL_OBJECT_LABEL_MAX = 40;

/** A row of public.hall_objects. */
export type HallObject = {
  id: number;
  hall_id: number;
  kind: HallObjectKind;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: Rotation;
  label: string | null;
};

export function isHallObjectKind(value: unknown): value is HallObjectKind {
  return typeof value === "string" && (HALL_OBJECT_KINDS as readonly string[]).includes(value);
}

export function isRotation(value: unknown): value is Rotation {
  return typeof value === "number" && (ROTATIONS as readonly number[]).includes(value);
}

/** "1,5" - a plan length in metres, Russian decimal comma, at most one
 * decimal place. */
export function metersLabel(units: number): string {
  const m = Math.round((units / UNITS_PER_METER) * 10) / 10;
  return (Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)).replace(".", ",");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Width/height of a footprint once rotated - a quarter turn swaps them. */
export function rotatedSize(w: number, h: number, rotation: number): { w: number; h: number } {
  return normalizeRotation(rotation) % 180 ? { w: h, h: w } : { w, h };
}

/** What collision/snapping needs to know about anything on the plan. */
export type Footprint = {
  key: string;
  x: number;
  y: number;
  w: number; // rotated
  h: number; // rotated
  solid: boolean;
  isTable: boolean;
};

export function tableFootprint(
  key: string,
  t: { pos_x: number; pos_y: number; shape: TableShape; max_capacity: number; rotation: number }
): Footprint {
  const size = tableSize(t.shape, t.max_capacity);
  const r = rotatedSize(size.w, size.h, t.rotation);
  return { key, x: t.pos_x, y: t.pos_y, w: r.w, h: r.h, solid: true, isTable: true };
}

export function objectFootprint(
  key: string,
  o: { pos_x: number; pos_y: number; width: number; height: number; rotation: number; kind: HallObjectKind }
): Footprint {
  const r = rotatedSize(o.width, o.height, o.rotation);
  return { key, x: o.pos_x, y: o.pos_y, w: r.w, h: r.h, solid: HALL_OBJECT_META[o.kind].solid, isTable: false };
}

/** Would `me`, centred at (x, y), overlap another solid object? Tables
 * keep TABLE_CLEARANCE from anything solid; two non-table objects may touch.
 * Non-solid objects (windows, doors, rails, the entrance) never collide. */
export function collides(others: Footprint[], me: Footprint, x: number, y: number): boolean {
  if (!me.solid) return false;
  return others.some((o) => {
    if (o.key === me.key || !o.solid) return false;
    const pad = me.isTable || o.isTable ? TABLE_CLEARANCE : 0;
    return Math.abs(x - o.x) < (me.w + o.w) / 2 + pad && Math.abs(y - o.y) < (me.h + o.h) / 2 + pad;
  });
}

/** Snap so the object's leading edge lands on the 25 cm grid. */
export function snapToGrid(raw: number, size: number): number {
  return Math.round((raw - size / 2) / SNAP_STEP) * SNAP_STEP + size / 2;
}

/** Keeps an object's whole footprint inside the room. */
export function clampInside(me: Footprint, x: number, y: number, planW: number, planH: number, margin = 0) {
  return {
    x: clamp(x, me.w / 2 + margin, Math.max(me.w / 2 + margin, planW - me.w / 2 - margin)),
    y: clamp(y, me.h / 2 + margin, Math.max(me.h / 2 + margin, planH - me.h / 2 - margin)),
  };
}

/** Pulls each axis onto the centre of a neighbour within MAGNET_RADIUS.
 * Returns the snapped values (null where nothing was close enough). */
export function magnetSnap(others: Footprint[], me: Footprint, x: number, y: number): { x: number | null; y: number | null } {
  let bestX = MAGNET_RADIUS;
  let bestY = MAGNET_RADIUS;
  let gx: number | null = null;
  let gy: number | null = null;
  for (const o of others) {
    if (o.key === me.key) continue;
    const dx = Math.abs(x - o.x);
    const dy = Math.abs(y - o.y);
    if (dx <= bestX) {
      bestX = dx;
      gx = o.x;
    }
    if (dy <= bestY) {
      bestY = dy;
      gy = o.y;
    }
  }
  return { x: gx, y: gy };
}

/** First free spot for a new/duplicated object: tries `preferred` points
 * in order, then scans the room on a 50 cm grid, nearest-to-centre first.
 * Null if the room is full. */
export function findFreeSpot(
  others: Footprint[],
  me: Footprint,
  planW: number,
  planH: number,
  preferred: { x: number; y: number }[] = []
): { x: number; y: number } | null {
  const fits = (p: { x: number; y: number }) =>
    p.x >= me.w / 2 && p.x <= planW - me.w / 2 && p.y >= me.h / 2 && p.y <= planH - me.h / 2 && !collides(others, me, p.x, p.y);

  for (const p of preferred) if (fits(p)) return p;

  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = me.h / 2 + SNAP_STEP; y <= planH - me.h / 2 - SNAP_STEP; y += GRID_CELL) {
    for (let x = me.w / 2 + SNAP_STEP; x <= planW - me.w / 2 - SNAP_STEP; x += GRID_CELL) {
      candidates.push({
        x: snapToGrid(x, me.w),
        y: snapToGrid(y, me.h),
        d: Math.abs(x - planW / 2) + Math.abs(y - planH / 2),
      });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  const found = candidates.find(fits);
  return found ? { x: found.x, y: found.y } : null;
}

/** The plan's size in units for a hall, falling back to the defaults for a
 * hall row that predates the real-scale migration. */
export function hallPlanSize(hall: { width_m?: number | string | null; length_m?: number | string | null }) {
  const widthM = Number(hall.width_m ?? DEFAULT_HALL_WIDTH_M) || DEFAULT_HALL_WIDTH_M;
  const lengthM = Number(hall.length_m ?? DEFAULT_HALL_LENGTH_M) || DEFAULT_HALL_LENGTH_M;
  return { widthM, lengthM, w: widthM * UNITS_PER_METER, h: lengthM * UNITS_PER_METER };
}

/** Validates the optional real-scale fields of a hall payload (width_m,
 * length_m, floor), writing accepted values into `update` and messages
 * into `errors`. Shared by POST and PATCH /api/halls. */
export function parseHallLayoutFields(
  payload: Record<string, unknown>,
  update: Record<string, unknown>,
  errors: Record<string, string>
): void {
  for (const field of ["width_m", "length_m"] as const) {
    const value = payload[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors[field] = "должно быть числом (метры)";
    } else if (value < HALL_SIZE_MIN_M || value > HALL_SIZE_MAX_M) {
      errors[field] = `от ${HALL_SIZE_MIN_M} до ${HALL_SIZE_MAX_M} м`;
    } else {
      update[field] = Math.round(value * 100) / 100;
    }
  }
  if (payload.floor !== undefined) {
    if (typeof payload.floor !== "string" || !(FLOOR_TYPES as readonly string[]).includes(payload.floor)) {
      errors.floor = `должно быть одним из: ${FLOOR_TYPES.join(", ")}`;
    } else {
      update.floor = payload.floor;
    }
  }
}

/** Validates a hall-object payload for POST (`requireAll`: kind and
 * position are mandatory, size/label fall back to the kind's defaults) or
 * PATCH (every field optional). Returns the column values to write. */
export function parseHallObjectFields(
  payload: Record<string, unknown>,
  requireAll: boolean
): { values: Record<string, unknown>; errors: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  const { kind, pos_x, pos_y, width, height, rotation, label } = payload;

  if (kind !== undefined || requireAll) {
    if (!isHallObjectKind(kind)) errors.kind = `должно быть одним из: ${HALL_OBJECT_KINDS.join(", ")}`;
    else values.kind = kind;
  }
  for (const [field, value] of [
    ["pos_x", pos_x],
    ["pos_y", pos_y],
  ] as const) {
    if (value === undefined && !requireAll) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > HALL_SIZE_MAX_M * UNITS_PER_METER) {
      errors[field] = "должно быть числом в пределах зала";
    } else values[field] = value;
  }
  for (const [field, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (value === undefined) {
      if (requireAll && isHallObjectKind(kind)) values[field] = HALL_OBJECT_META[kind][field === "width" ? "w" : "h"];
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > HALL_OBJECT_MAX_SIZE) {
      errors[field] = `должно быть числом от 1 до ${HALL_OBJECT_MAX_SIZE}`;
    } else values[field] = value;
  }
  if (rotation !== undefined) {
    if (!isRotation(rotation)) errors.rotation = "должно быть 0, 90, 180 или 270";
    else values.rotation = rotation;
  }
  if (label !== undefined) {
    if (label !== null && typeof label !== "string") errors.label = "должно быть строкой";
    else if (typeof label === "string" && label.trim().length > HALL_OBJECT_LABEL_MAX) {
      errors.label = `не более ${HALL_OBJECT_LABEL_MAX} символов`;
    } else values.label = typeof label === "string" && label.trim() ? label.trim() : null;
  } else if (requireAll && isHallObjectKind(kind)) {
    values.label = HALL_OBJECT_META[kind].label || null;
  }

  return { values, errors };
}

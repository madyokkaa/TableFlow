/** The hall editor's document model and the diff that turns two versions of
 * it into API calls. Every edit (drag, rotate, inspector change, undo) is
 * "replace the document with a new version"; diffDocs works out what to
 * send, so undo needs no special persistence path - it is just another
 * document version. Pure, so it's unit-tested without a browser or DB. */

import type { DiningTable } from "@/components/hostess/TableForm";
import type { Hall } from "@/components/hostess/HallForm";
import {
  DEFAULT_HALL_LENGTH_M,
  DEFAULT_HALL_WIDTH_M,
  normalizeRotation,
  type FloorType,
  type HallObject,
  type HallObjectKind,
  type Rotation,
} from "./floorPlan";
import type { TableShape } from "./tableShapes";

export type EditorHall = {
  name: string;
  description: string;
  width_m: number;
  length_m: number;
  floor: FloorType;
};

export type EditorTable = {
  /** Stable client-side identity; the server id (if any) lives elsewhere,
   * so a deleted-then-undone table can come back under a new server id. */
  key: string;
  label: string;
  shape: TableShape;
  min_capacity: number;
  max_capacity: number;
  pos_x: number;
  pos_y: number;
  rotation: Rotation;
  is_active: boolean;
  manual_status: DiningTable["manual_status"];
};

export type EditorObject = {
  key: string;
  kind: HallObjectKind;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: Rotation;
  /** "" = no caption. */
  label: string;
};

export type EditorDoc = { hall: EditorHall; tables: EditorTable[]; objects: EditorObject[] };

export const TABLE_FIELDS = [
  "label",
  "shape",
  "min_capacity",
  "max_capacity",
  "pos_x",
  "pos_y",
  "rotation",
  "is_active",
  "manual_status",
] as const;
export const OBJECT_FIELDS = ["kind", "pos_x", "pos_y", "width", "height", "rotation", "label"] as const;
export const HALL_FIELDS = ["name", "description", "width_m", "length_m", "floor"] as const;

export type SyncOp =
  | { type: "hall"; patch: Partial<EditorHall>; prev: EditorHall }
  | { type: "table-create"; item: EditorTable }
  | { type: "table-patch"; key: string; patch: Partial<EditorTable>; prev: EditorTable }
  | { type: "table-delete"; item: EditorTable }
  | { type: "object-create"; item: EditorObject }
  | { type: "object-patch"; key: string; patch: Partial<EditorObject>; prev: EditorObject }
  | { type: "object-delete"; item: EditorObject };

function changedFields<T extends object>(prev: T, next: T, fields: readonly (keyof T)[]): Partial<T> {
  const patch: Partial<T> = {};
  for (const field of fields) {
    if (prev[field] !== next[field]) patch[field] = next[field];
  }
  return patch;
}

function diffList<T extends { key: string }>(
  prev: T[],
  next: T[],
  fields: readonly (keyof T)[],
  make: {
    create: (item: T) => SyncOp;
    patch: (key: string, patch: Partial<T>, prev: T) => SyncOp;
    remove: (item: T) => SyncOp;
  }
): SyncOp[] {
  const ops: SyncOp[] = [];
  const prevByKey = new Map(prev.map((item) => [item.key, item]));
  const nextKeys = new Set(next.map((item) => item.key));

  for (const item of prev) if (!nextKeys.has(item.key)) ops.push(make.remove(item));
  for (const item of next) {
    const before = prevByKey.get(item.key);
    if (!before) {
      ops.push(make.create(item));
      continue;
    }
    if (before === item) continue;
    const patch = changedFields(before, item, fields);
    if (Object.keys(patch).length > 0) ops.push(make.patch(item.key, patch, before));
  }
  return ops;
}

/** Operations that take the server from `prev` to `next`: hall settings
 * first, then deletions (so a freed label can be reused), then creations
 * and edits in document order. */
export function diffDocs(prev: EditorDoc, next: EditorDoc): SyncOp[] {
  const ops: SyncOp[] = [];

  if (prev.hall !== next.hall) {
    const patch = changedFields(prev.hall, next.hall, HALL_FIELDS);
    if (Object.keys(patch).length > 0) ops.push({ type: "hall", patch, prev: prev.hall });
  }

  const tableOps = diffList(prev.tables, next.tables, TABLE_FIELDS, {
    create: (item) => ({ type: "table-create", item }),
    patch: (key, patch, before) => ({ type: "table-patch", key, patch, prev: before }),
    remove: (item) => ({ type: "table-delete", item }),
  });
  const objectOps = diffList(prev.objects, next.objects, OBJECT_FIELDS, {
    create: (item) => ({ type: "object-create", item }),
    patch: (key, patch, before) => ({ type: "object-patch", key, patch, prev: before }),
    remove: (item) => ({ type: "object-delete", item }),
  });

  const deletions = [...tableOps, ...objectOps].filter((op) => op.type.endsWith("-delete"));
  const rest = [...tableOps, ...objectOps].filter((op) => !op.type.endsWith("-delete"));
  return [...ops, ...deletions, ...rest];
}

/** Puts back what a failed operation tried to change, leaving every other
 * edit made since in place. */
export function revertOp(doc: EditorDoc, op: SyncOp): EditorDoc {
  switch (op.type) {
    case "hall": {
      const restored = { ...doc.hall };
      for (const field of Object.keys(op.patch) as (keyof EditorHall)[]) {
        (restored as Record<string, unknown>)[field] = op.prev[field];
      }
      return { ...doc, hall: restored };
    }
    case "table-create":
      return { ...doc, tables: doc.tables.filter((t) => t.key !== op.item.key) };
    case "table-delete":
      return doc.tables.some((t) => t.key === op.item.key) ? doc : { ...doc, tables: [...doc.tables, op.item] };
    case "table-patch":
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (t.key !== op.key) return t;
          const restored = { ...t };
          for (const field of Object.keys(op.patch) as (keyof EditorTable)[]) {
            (restored as Record<string, unknown>)[field] = op.prev[field];
          }
          return restored;
        }),
      };
    case "object-create":
      return { ...doc, objects: doc.objects.filter((o) => o.key !== op.item.key) };
    case "object-delete":
      return doc.objects.some((o) => o.key === op.item.key) ? doc : { ...doc, objects: [...doc.objects, op.item] };
    case "object-patch":
      return {
        ...doc,
        objects: doc.objects.map((o) => {
          if (o.key !== op.key) return o;
          const restored = { ...o };
          for (const field of Object.keys(op.patch) as (keyof EditorObject)[]) {
            (restored as Record<string, unknown>)[field] = op.prev[field];
          }
          return restored;
        }),
      };
  }
}

export function tableKey(id: number): string {
  return `t:${id}`;
}

export function objectKey(id: number): string {
  return `o:${id}`;
}

export function toEditorHall(hall: Hall): EditorHall {
  return {
    name: hall.name,
    description: hall.description ?? "",
    width_m: Number(hall.width_m ?? DEFAULT_HALL_WIDTH_M) || DEFAULT_HALL_WIDTH_M,
    length_m: Number(hall.length_m ?? DEFAULT_HALL_LENGTH_M) || DEFAULT_HALL_LENGTH_M,
    floor: hall.floor ?? "wood",
  };
}

export function toEditorTable(table: DiningTable): EditorTable {
  return {
    key: tableKey(table.id),
    label: table.label,
    shape: table.shape,
    min_capacity: table.min_capacity,
    max_capacity: table.max_capacity,
    pos_x: table.pos_x,
    pos_y: table.pos_y,
    rotation: normalizeRotation(table.rotation ?? 0),
    is_active: table.is_active,
    manual_status: table.manual_status,
  };
}

export function toEditorObject(object: HallObject): EditorObject {
  return {
    key: objectKey(object.id),
    kind: object.kind,
    pos_x: object.pos_x,
    pos_y: object.pos_y,
    width: object.width,
    height: object.height,
    rotation: normalizeRotation(object.rotation ?? 0),
    label: object.label ?? "",
  };
}

/** Next free numeric table label in the hall ("12" after "11"). */
export function nextTableLabel(tables: { label: string }[]): string {
  let max = 0;
  for (const t of tables) {
    const n = Number.parseInt(t.label, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let candidate = max + 1;
  const taken = new Set(tables.map((t) => t.label));
  while (taken.has(String(candidate))) candidate += 1;
  return String(candidate);
}

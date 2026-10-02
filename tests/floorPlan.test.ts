import { describe, expect, it } from "vitest";
import { seatPlacements, tableSize } from "../lib/tableShapes";
import {
  MAGNET_RADIUS,
  collides,
  findFreeSpot,
  magnetSnap,
  metersLabel,
  normalizeRotation,
  objectFootprint,
  parseHallLayoutFields,
  parseHallObjectFields,
  rotatedSize,
  snapToGrid,
  tableFootprint,
  type Footprint,
} from "../lib/floorPlan";
import { diffDocs, nextTableLabel, revertOp, type EditorDoc, type EditorTable } from "../lib/hallEditor";

describe("tableSize", () => {
  it("sizes round tables by capacity", () => {
    expect(tableSize("round", 2)).toEqual({ w: 60, h: 60 });
    expect(tableSize("round", 4)).toEqual({ w: 80, h: 80 });
    expect(tableSize("round", 6)).toEqual({ w: 100, h: 100 });
    expect(tableSize("round", 8)).toEqual({ w: 120, h: 120 });
  });

  it("sizes square tables by capacity", () => {
    expect(tableSize("square", 4)).toEqual({ w: 80, h: 80 });
    expect(tableSize("square", 8)).toEqual({ w: 100, h: 100 });
    expect(tableSize("square", 10)).toEqual({ w: 120, h: 120 });
  });

  it("grows rectangular tables 40 units per pair of seats", () => {
    expect(tableSize("rectangle", 4)).toEqual({ w: 120, h: 60 });
    expect(tableSize("rectangle", 5)).toEqual({ w: 160, h: 60 });
    expect(tableSize("rectangle", 6)).toEqual({ w: 160, h: 60 });
  });
});

describe("seatPlacements", () => {
  it("draws one chair per seat", () => {
    for (const shape of ["round", "square", "rectangle"] as const) {
      for (const max of [1, 2, 4, 5, 8]) expect(seatPlacements(shape, max)).toHaveLength(max);
    }
  });

  it("splits a rectangle's chairs across both long sides", () => {
    const seats = seatPlacements("rectangle", 5);
    expect(seats.filter((s) => s.angle === 0)).toHaveLength(3);
    expect(seats.filter((s) => s.angle === 180)).toHaveLength(2);
  });
});

describe("plan geometry", () => {
  it("swaps width and height on a quarter turn", () => {
    expect(rotatedSize(120, 60, 0)).toEqual({ w: 120, h: 60 });
    expect(rotatedSize(120, 60, 90)).toEqual({ w: 60, h: 120 });
    expect(rotatedSize(120, 60, 270)).toEqual({ w: 60, h: 120 });
  });

  it("normalizes rotations to 0/90/180/270", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it("snaps an object's leading edge to the 25 cm grid", () => {
    // 60-wide object: edge at 103 snaps to 100, centre at 130.
    expect(snapToGrid(133, 60)).toBe(130);
    expect(snapToGrid(40, 80)).toBe(40);
  });

  it("formats lengths in metres with a decimal comma", () => {
    expect(metersLabel(80)).toBe("1");
    expect(metersLabel(680)).toBe("8,5");
    expect(metersLabel(1200)).toBe("15");
  });
});

const table = (key: string, x: number, y: number): Footprint =>
  tableFootprint(key, { pos_x: x, pos_y: y, shape: "round", max_capacity: 4, rotation: 0 });

describe("collides", () => {
  it("keeps clearance between tables", () => {
    const a = table("a", 200, 200);
    const b = table("b", 0, 0);
    expect(collides([a], b, 200 + 80 + 10, 200)).toBe(true); // touching chairs
    expect(collides([a], b, 200 + 80 + 30, 200)).toBe(false); // clear of a
  });

  it("never blocks on non-solid objects like windows", () => {
    const window = objectFootprint("w", { pos_x: 200, pos_y: 200, width: 200, height: 12, rotation: 0, kind: "window" });
    expect(collides([window], table("t", 0, 0), 200, 200)).toBe(false);
  });

  it("ignores the object itself", () => {
    const a = table("a", 200, 200);
    expect(collides([a], a, 200, 200)).toBe(false);
  });
});

describe("magnetSnap", () => {
  it("pulls onto a neighbour's centre within the magnet radius only", () => {
    const others = [table("a", 400, 100)];
    expect(magnetSnap(others, table("me", 0, 0), 400 + MAGNET_RADIUS - 1, 300)).toEqual({ x: 400, y: null });
    expect(magnetSnap(others, table("me", 0, 0), 400 + MAGNET_RADIUS + 5, 300)).toEqual({ x: null, y: null });
  });
});

describe("findFreeSpot", () => {
  it("prefers the requested spot when it is free", () => {
    expect(findFreeSpot([], table("me", 0, 0), 1200, 680, [{ x: 300, y: 300 }])).toEqual({ x: 300, y: 300 });
  });

  it("finds a non-overlapping spot in a busy room", () => {
    const others = [table("a", 600, 340)];
    const me = table("me", 0, 0);
    const spot = findFreeSpot(others, me, 1200, 680);
    expect(spot).not.toBeNull();
    expect(collides(others, me, spot!.x, spot!.y)).toBe(false);
  });

  it("returns null when the room is full", () => {
    const me = tableFootprint("me", { pos_x: 0, pos_y: 0, shape: "rectangle", max_capacity: 20, rotation: 0 });
    expect(findFreeSpot([], me, 320, 320)).toBeNull();
  });
});

describe("API field validation", () => {
  it("accepts a valid hall size and floor and rejects bad ones", () => {
    const update: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    parseHallLayoutFields({ width_m: 12, length_m: 8.5, floor: "tile" }, update, errors);
    expect(errors).toEqual({});
    expect(update).toEqual({ width_m: 12, length_m: 8.5, floor: "tile" });

    const badErrors: Record<string, string> = {};
    parseHallLayoutFields({ width_m: 2, floor: "carpet" }, {}, badErrors);
    expect(Object.keys(badErrors).sort()).toEqual(["floor", "width_m"]);
  });

  it("fills an object's size and label from its kind on create", () => {
    const { values, errors } = parseHallObjectFields({ kind: "bar", pos_x: 400, pos_y: 200 }, true);
    expect(errors).toEqual({});
    expect(values).toMatchObject({ kind: "bar", width: 320, height: 80, label: "Бар" });
  });

  it("rejects an unknown kind and a bad rotation", () => {
    const { errors } = parseHallObjectFields({ kind: "pool", pos_x: 1, pos_y: 1, rotation: 45 }, true);
    expect(Object.keys(errors).sort()).toEqual(["kind", "rotation"]);
  });

  it("allows a partial update", () => {
    const { values, errors } = parseHallObjectFields({ rotation: 90, label: "  " }, false);
    expect(errors).toEqual({});
    expect(values).toEqual({ rotation: 90, label: null });
  });
});

const baseTable: EditorTable = {
  key: "t:1",
  label: "1",
  shape: "round",
  min_capacity: 1,
  max_capacity: 2,
  pos_x: 100,
  pos_y: 100,
  rotation: 0,
  is_active: true,
  manual_status: null,
};
const baseDoc: EditorDoc = {
  hall: { name: "Зал", description: "", width_m: 15, length_m: 8.5, floor: "wood" },
  tables: [baseTable],
  objects: [],
};

describe("diffDocs", () => {
  it("sends only the fields that changed", () => {
    const next = { ...baseDoc, tables: [{ ...baseTable, pos_x: 140, rotation: 90 as const }] };
    expect(diffDocs(baseDoc, next)).toEqual([
      { type: "table-patch", key: "t:1", patch: { pos_x: 140, rotation: 90 }, prev: baseTable },
    ]);
  });

  it("orders hall changes, then deletions, then creations", () => {
    const added = { ...baseTable, key: "t:new", label: "2" };
    const next: EditorDoc = { ...baseDoc, hall: { ...baseDoc.hall, floor: "tile" }, tables: [added] };
    expect(diffDocs(baseDoc, next).map((op) => op.type)).toEqual(["hall", "table-delete", "table-create"]);
  });

  it("returns nothing for an unchanged document", () => {
    expect(diffDocs(baseDoc, baseDoc)).toEqual([]);
  });

  it("undo is just the reverse diff", () => {
    const moved = { ...baseDoc, tables: [{ ...baseTable, pos_y: 300 }] };
    expect(diffDocs(moved, baseDoc)).toEqual([
      { type: "table-patch", key: "t:1", patch: { pos_y: 100 }, prev: moved.tables[0] },
    ]);
  });
});

describe("revertOp", () => {
  it("restores only the failed fields, keeping later edits", () => {
    const next = { ...baseDoc, tables: [{ ...baseTable, label: "VIP", pos_x: 500 }] };
    const op = { type: "table-patch" as const, key: "t:1", patch: { label: "VIP" }, prev: baseTable };
    expect(revertOp(next, op).tables[0]).toMatchObject({ label: "1", pos_x: 500 });
  });

  it("puts a table back after a failed delete", () => {
    const op = { type: "table-delete" as const, item: baseTable };
    expect(revertOp({ ...baseDoc, tables: [] }, op).tables).toEqual([baseTable]);
  });
});

describe("nextTableLabel", () => {
  it("continues the numbering", () => {
    expect(nextTableLabel([{ label: "1" }, { label: "7" }, { label: "VIP" }])).toBe("8");
    expect(nextTableLabel([])).toBe("1");
  });
});

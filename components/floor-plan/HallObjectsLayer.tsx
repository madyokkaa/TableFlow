"use client";

import { useEffect, useState } from "react";
import { HALL_OBJECT_META, type HallObject } from "@/lib/floorPlan";
import { ObjectArtwork, objectFontSize, type UnitFn } from "./PlanShapes";

// One cache for every small read-only plan on the page (dashboard card,
// staff login), so switching halls back and forth doesn't refetch.
const cache = new Map<number, Promise<HallObject[]>>();

function loadHallObjects(hallId: number): Promise<HallObject[]> {
  let pending = cache.get(hallId);
  if (!pending) {
    pending = fetch(`/api/halls/${hallId}/objects`)
      .then((res) => (res.ok ? res.json() : []))
      .then((objects: unknown) => (Array.isArray(objects) ? (objects as HallObject[]) : []))
      .catch(() => {
        cache.delete(hallId);
        return [];
      });
    cache.set(hallId, pending);
  }
  return pending;
}

/** A hall's fixed objects (bar, entrance, walls, windows…) from the same
 * public endpoint the guest plan uses. Empty until loaded or on error -
 * tables alone still make a usable plan. */
export function useHallObjects(hallId: number | null): HallObject[] {
  const [loaded, setLoaded] = useState<{ hallId: number; objects: HallObject[] } | null>(null);
  useEffect(() => {
    if (hallId === null) return;
    let cancelled = false;
    loadHallObjects(hallId).then((objects) => {
      if (!cancelled) setLoaded({ hallId, objects });
    });
    return () => {
      cancelled = true;
    };
  }, [hallId]);
  return loaded && loaded.hallId === hallId ? loaded.objects : [];
}

/** Draws the objects inside a plan box sized as `room` (plan units), under
 * the tables - for read-only mini plans. */
export function HallObjectsLayer({ objects, room, unit }: { objects: HallObject[]; room: { w: number; h: number }; unit: UnitFn }) {
  return (
    <>
      {objects.map((o) => (
        <span
          key={o.id}
          aria-hidden="true"
          title={o.label || HALL_OBJECT_META[o.kind]?.name}
          className={`fp-obj fp-static pointer-events-none k-${o.kind}`}
          style={{
            left: `${(o.pos_x / room.w) * 100}%`,
            top: `${(o.pos_y / room.h) * 100}%`,
            width: unit(o.width),
            height: unit(o.height),
            transform: `translate(-50%, -50%) rotate(${o.rotation ?? 0}deg)`,
            fontSize: objectFontSize(o.width, o.height, unit),
          }}
        >
          <ObjectArtwork label={o.label} />
        </span>
      ))}
    </>
  );
}

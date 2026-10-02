"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Copy, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import {
  HALL_OBJECT_META,
  SNAP_STEP,
  TABLE_WALL_MARGIN,
  UNITS_PER_METER,
  clamp,
  clampInside,
  collides,
  magnetSnap,
  objectFootprint,
  snapToGrid,
  tableFootprint,
  type Footprint,
} from "@/lib/floorPlan";
import type { EditorDoc } from "@/lib/hallEditor";
import {
  ObjectArtwork,
  TableArtwork,
  floorStyle,
  objectFontSize,
  planUnits,
  tableBoxStyle,
  tableCapacityText,
  type TableVisualState,
} from "@/components/floor-plan/PlanShapes";

const DRAG_THRESHOLD_PX = 4;

export type PlanOptions = { grid: boolean; magnet: boolean; seats: boolean };

type DragStart = { key: string; startX: number; startY: number; origX: number; origY: number; unitsPerPx: number; moved: boolean };
type DragLive = {
  key: string;
  x: number;
  y: number;
  bad: boolean;
  guideX: number | null;
  guideY: number | null;
  from: { x: number; y: number; w: number; h: number; round: boolean };
};

/** The hall editor's plan: the room drawn to scale (1 grid cell = 50 cm),
 * tables with their chairs and every other object, dragged around with
 * grid snapping, magnet guides and overlap prevention. Positions are kept
 * in plan units; the editor owns the document and persistence. */
export function FloorPlanCanvas({
  doc,
  planW,
  planH,
  zoom,
  options,
  selectedKey,
  tableStates,
  shakeKey,
  spawnKey,
  scrollRef,
  onSelect,
  onMove,
  onBlocked,
  onNudge,
  onRotate,
  onDuplicate,
  onDelete,
}: {
  doc: EditorDoc;
  planW: number;
  planH: number;
  zoom: number;
  options: PlanOptions;
  selectedKey: string | null;
  tableStates: Map<string, TableVisualState>;
  shakeKey: string | null;
  spawnKey: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSelect: (key: string | null) => void;
  onMove: (key: string, x: number, y: number) => void;
  onBlocked: (key: string) => void;
  onNudge: (key: string, dx: number, dy: number) => void;
  onRotate: (key: string, delta: number) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const planRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const [drag, setDrag] = useState<DragLive | null>(null);

  const unit = useMemo(() => planUnits(planW), [planW]);

  const footprints = useMemo(() => {
    const map = new Map<string, Footprint>();
    for (const t of doc.tables) map.set(t.key, tableFootprint(t.key, t));
    for (const o of doc.objects) map.set(o.key, objectFootprint(o.key, o));
    return map;
  }, [doc.tables, doc.objects]);

  function handlePointerDown(key: string, e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const plan = planRef.current;
    const me = footprints.get(key);
    if (!plan || !me) return;
    const rect = plan.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released - the drag just won't start.
    }
    dragStart.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: me.x,
      origY: me.y,
      unitsPerPx: planW / rect.width,
      moved: false,
    };
    onSelect(key);
  }

  function handlePointerMove(key: string, e: PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    if (!start || start.key !== key) return;
    if (!start.moved && Math.abs(e.clientX - start.startX) + Math.abs(e.clientY - start.startY) < DRAG_THRESHOLD_PX) return;
    start.moved = true;

    const me = footprints.get(key);
    if (!me) return;
    const margin = me.isTable ? TABLE_WALL_MARGIN : 0;
    const rawX = clamp(start.origX + (e.clientX - start.startX) * start.unitsPerPx, me.w / 2 + margin, planW - me.w / 2 - margin);
    const rawY = clamp(start.origY + (e.clientY - start.startY) * start.unitsPerPx, me.h / 2 + margin, planH - me.h / 2 - margin);

    const others = [...footprints.values()].filter((f) => f.key !== key);
    const guides = options.magnet ? magnetSnap(others, me, rawX, rawY) : { x: null, y: null };
    const snappedX = guides.x ?? (options.grid ? snapToGrid(rawX, me.w) : Math.round(rawX));
    const snappedY = guides.y ?? (options.grid ? snapToGrid(rawY, me.h) : Math.round(rawY));
    const { x, y } = clampInside(me, snappedX, snappedY, planW, planH);

    const table = doc.tables.find((t) => t.key === key);
    setDrag({
      key,
      x,
      y,
      bad: collides(others, me, x, y),
      guideX: guides.x,
      guideY: guides.y,
      from: { x: start.origX, y: start.origY, w: me.w, h: me.h, round: table?.shape === "round" },
    });
  }

  function handlePointerUp(key: string) {
    const start = dragStart.current;
    if (!start || start.key !== key) return;
    dragStart.current = null;
    const live = drag;
    setDrag(null);
    if (!start.moved || !live || live.key !== key) return;
    if (live.bad) {
      onBlocked(key);
      return;
    }
    if (live.x !== start.origX || live.y !== start.origY) onMove(key, live.x, live.y);
  }

  function handleKeyDown(key: string, e: KeyboardEvent<HTMLElement>) {
    const step = e.shiftKey ? UNITS_PER_METER : SNAP_STEP;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        onNudge(key, -step, 0);
        return;
      case "ArrowRight":
        e.preventDefault();
        onNudge(key, step, 0);
        return;
      case "ArrowUp":
        e.preventDefault();
        onNudge(key, 0, -step);
        return;
      case "ArrowDown":
        e.preventDefault();
        onNudge(key, 0, step);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onDelete(key);
        return;
      case "r":
      case "R":
      case "к":
      case "К":
        e.preventDefault();
        onRotate(key, 90);
        return;
      case "Escape":
        onSelect(null);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(key);
        return;
    }
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  const handlers = (key: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => handlePointerDown(key, e),
    onPointerMove: (e: PointerEvent<HTMLElement>) => handlePointerMove(key, e),
    onPointerUp: () => handlePointerUp(key),
    onPointerCancel: () => handlePointerUp(key),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => handleKeyDown(key, e),
  });

  const stateClasses = (key: string) =>
    [
      drag?.key === key ? "fp-drag" : "",
      drag?.key === key && drag.bad ? "fp-bad" : "",
      shakeKey === key ? "fp-shake" : "",
      spawnKey === key ? "fp-spawn" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const selected = selectedKey ? footprints.get(selectedKey) : undefined;
  const selectedIsTable = !!selected?.isTable;
  const showSelection = selected && !drag;
  const selPad = selectedIsTable ? 40 : 14;
  const barTopUnits = selected ? selected.y - selected.h / 2 - (selectedIsTable ? 20 : 0) : 0;
  const barBelow = (barTopUnits / planH) * 100 < 14;

  return (
    <div
      ref={scrollRef}
      className="max-h-[calc(100dvh-230px)] overflow-auto rounded-[22px] border border-line-strong bg-[#100c0b]"
    >
      <div
        ref={planRef}
        className={`fp-plan ${options.seats ? "" : "fp-noseats"}`}
        style={{ width: `${zoom}%`, aspectRatio: `${planW} / ${planH}`, ...floorStyle(doc.hall.floor, planW, planH, options.grid) }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
        role="application"
        aria-label={`План зала ${doc.hall.name}. Выберите объект и двигайте его стрелками; R — поворот, Delete — удаление, Esc — снять выделение.`}
      >
        {drag && (
          <span
            className={`fp-ghost ${drag.from.round ? "round" : ""}`}
            style={{ left: pct(drag.from.x, planW), top: pct(drag.from.y, planH), width: unit(drag.from.w), height: unit(drag.from.h) }}
          />
        )}

        {doc.objects.map((o) => {
          const meta = HALL_OBJECT_META[o.kind];
          const live = drag?.key === o.key ? drag : null;
          return (
            <button
              key={o.key}
              type="button"
              className={`fp-obj k-${o.kind} ${stateClasses(o.key)}`}
              style={{
                left: pct(live?.x ?? o.pos_x, planW),
                top: pct(live?.y ?? o.pos_y, planH),
                width: unit(o.width),
                height: unit(o.height),
                transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
                fontSize: objectFontSize(o.width, o.height, unit),
              }}
              aria-label={`${meta.name}${o.label ? ` «${o.label}»` : ""}. Стрелки — сдвиг, R — поворот, Delete — удалить`}
              aria-pressed={selectedKey === o.key}
              {...handlers(o.key)}
            >
              <ObjectArtwork label={o.label} />
            </button>
          );
        })}

        {doc.tables.map((t, i) => {
          const live = drag?.key === t.key ? drag : null;
          const state = tableStates.get(t.key) ?? "free";
          const cap = tableCapacityText(t.min_capacity, t.max_capacity);
          return (
            <button
              key={t.key}
              type="button"
              className={`fp-obj fp-table ${t.shape} s-${state} ${stateClasses(t.key)}`}
              style={{
                left: pct(live?.x ?? t.pos_x, planW),
                top: pct(live?.y ?? t.pos_y, planH),
                ...tableBoxStyle(t.shape, t.max_capacity, unit),
                transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
              }}
              aria-label={`Стол ${t.label}, ${cap} мест. Стрелки — сдвиг, R — поворот, Delete — удалить`}
              aria-pressed={selectedKey === t.key}
              {...handlers(t.key)}
            >
              <TableArtwork
                shape={t.shape}
                maxCapacity={t.max_capacity}
                label={t.label}
                capacityText={cap}
                rotation={t.rotation}
                unit={unit}
                delayIndex={i}
              />
            </button>
          );
        })}

        {drag?.guideX != null && <span className="fp-guide v" style={{ left: pct(drag.guideX, planW) }} />}
        {drag?.guideY != null && <span className="fp-guide h" style={{ top: pct(drag.guideY, planH) }} />}

        {showSelection && selected && (
          <>
            <span
              key={`sel-${selectedKey}`}
              className="fp-selbox"
              style={{
                left: pct(selected.x, planW),
                top: pct(selected.y, planH),
                width: unit(selected.w + selPad),
                height: unit(selected.h + selPad),
              }}
            >
              <i />
              <i />
              <i />
              <i />
            </span>
            <div
              role="toolbar"
              aria-label="Действия с выделенным"
              className="absolute z-[12] flex gap-0.5 rounded-[13px] bg-ink p-1 text-[#1d1614] shadow-[0_14px_30px_-12px_#000]"
              style={{
                left: pct(selected.x, planW),
                top: barBelow ? pct(selected.y + selected.h / 2 + 20, planH) : pct(barTopUnits, planH),
                transform: barBelow ? "translate(-50%, 14px)" : "translate(-50%, calc(-100% - 14px))",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <QuickButton label="Повернуть влево" onClick={() => onRotate(selected.key, -90)}>
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </QuickButton>
              <QuickButton label="Повернуть вправо" onClick={() => onRotate(selected.key, 90)}>
                <RotateCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </QuickButton>
              <QuickButton label="Дублировать" onClick={() => onDuplicate(selected.key)}>
                <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </QuickButton>
              <span className="mx-0.5 my-1.5 w-px bg-[#d8c9c2]" aria-hidden="true" />
              <QuickButton label="Удалить" danger onClick={() => onDelete(selected.key)}>
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </QuickButton>
            </div>
          </>
        )}

        <span className="fp-ruler" aria-hidden="true">
          <i style={{ width: unit(UNITS_PER_METER) }} />1 м · клетка 50 см
        </span>
      </div>
    </div>
  );
}

function QuickButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-[9px] transition-colors duration-200 ${
        danger ? "hover:bg-status-cancelled hover:text-on-accent" : "hover:bg-[#e6d8d2]"
      }`}
    >
      {children}
    </button>
  );
}

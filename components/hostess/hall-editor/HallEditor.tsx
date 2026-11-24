"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Minus, Plus, SlidersHorizontal, Undo2 } from "lucide-react";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { Hall } from "@/components/hostess/HallForm";
import { FloorPlanCanvas, type PlanOptions } from "@/components/hostess/FloorPlanCanvas";
import type { TableVisualState } from "@/components/floor-plan/PlanShapes";
import {
  GRID_CELL,
  HALL_OBJECT_META,
  HALL_SIZE_MAX_M,
  HALL_SIZE_MIN_M,
  UNITS_PER_METER,
  clampInside,
  collides,
  findFreeSpot,
  metersLabel,
  normalizeRotation,
  objectFootprint,
  tableFootprint,
  type Footprint,
  type HallObject,
  type HallObjectKind,
} from "@/lib/floorPlan";
import {
  nextTableLabel,
  objectKey,
  revertOp,
  tableKey,
  toEditorHall,
  toEditorObject,
  toEditorTable,
  type EditorDoc,
  type EditorObject,
  type EditorTable,
  type SyncOp,
} from "@/lib/hallEditor";
import { DEFAULT_DURATION_MINUTES, restaurantNowMinutes, timeToMinutes } from "@/lib/scheduling";
import { pluralize } from "@/lib/ru";
import { useHallSync } from "./useHallSync";
import { Palette, type TablePreset } from "./Palette";
import { Inspector, type TableBooking } from "./Inspector";
import { GHOST_BUTTON } from "./controls";

export type TodayReservation = TableBooking & { duration_minutes: number | null; table_ids: number[] };

const HISTORY_LIMIT = 40;
const ZOOM_MIN = 40;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const OPTIONS_KEY = "tf.hallEditor.options";
const DEFAULT_OPTIONS: PlanOptions = { grid: true, magnet: true, seats: true };

function readOptions(): PlanOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPTIONS_KEY) ?? "null");
    return saved ? { ...DEFAULT_OPTIONS, ...saved } : DEFAULT_OPTIONS;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

let newKeyCounter = 0;
function newKey(prefix: "t" | "o"): string {
  newKeyCounter += 1;
  return `${prefix}:new:${Date.now()}:${newKeyCounter}`;
}

function footprintsOf(doc: EditorDoc): Footprint[] {
  return [
    ...doc.tables.map((t) => tableFootprint(t.key, t)),
    ...doc.objects.map((o) => objectFootprint(o.key, o)),
  ];
}

type Toast = { id: number; text: string; undo: boolean };

/** The floor-plan editor for one hall: palette on the left, the to-scale
 * plan in the middle, an inspector on the right. Every change replaces the
 * editor's document; useHallSync persists the difference, and undo just
 * restores an earlier document the same way. */
export function HallEditor({
  hallId,
  initialHall,
  initialTables,
  initialObjects,
  reservationsToday,
}: {
  hallId: number;
  initialHall: Hall;
  initialTables: DiningTable[];
  initialObjects: HallObject[];
  reservationsToday: TodayReservation[];
}) {
  const [doc, setDoc] = useState<EditorDoc>(() => ({
    hall: toEditorHall(initialHall),
    tables: initialTables.map(toEditorTable),
    objects: initialObjects.map(toEditorObject),
  }));
  // The latest document and history, readable from event handlers without
  // stale closures; state mirrors them for rendering.
  const docRef = useRef(doc);
  const historyRef = useRef<EditorDoc[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [inspectorTick, setInspectorTick] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [options, setOptions] = useState<PlanOptions>(readOptions);
  const [toast, setToast] = useState<Toast | null>(null);
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const [spawnKey, setSpawnKey] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(restaurantNowMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastId = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const shakeTimer = useRef<number | undefined>(undefined);
  const spawnTimer = useRef<number | undefined>(undefined);

  const planW = doc.hall.width_m * UNITS_PER_METER;
  const planH = doc.hall.length_m * UNITS_PER_METER;

  // --- feedback ------------------------------------------------------------

  const showToast = useCallback((text: string, undo = false) => {
    window.clearTimeout(toastTimer.current);
    toastId.current += 1;
    setToast({ id: toastId.current, text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const shake = useCallback((key: string) => {
    window.clearTimeout(shakeTimer.current);
    setShakeKey(null);
    window.requestAnimationFrame(() => setShakeKey(key));
    shakeTimer.current = window.setTimeout(() => setShakeKey(null), 480);
  }, []);

  const spawn = useCallback((key: string) => {
    window.clearTimeout(spawnTimer.current);
    setSpawnKey(key);
    spawnTimer.current = window.setTimeout(() => setSpawnKey(null), 800);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(restaurantNowMinutes()), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(shakeTimer.current);
      window.clearTimeout(spawnTimer.current);
    };
  }, []);

  // --- persistence ---------------------------------------------------------

  const setDocument = useCallback((next: EditorDoc) => {
    docRef.current = next;
    setDoc(next);
  }, []);

  const handleSyncError = useCallback(
    (op: SyncOp, message: string) => {
      setDocument(revertOp(docRef.current, op));
      if (op.type === "table-delete" || op.type === "object-delete") shake(op.item.key);
      showToast(message.charAt(0).toUpperCase() + message.slice(1));
    },
    [setDocument, shake, showToast]
  );

  const initialIds = useMemo<[string, number][]>(
    () => [
      ...initialTables.map((t): [string, number] => [tableKey(t.id), t.id]),
      ...initialObjects.map((o): [string, number] => [objectKey(o.id), o.id]),
    ],
    [initialTables, initialObjects]
  );
  const { sync, pending, serverIdOf } = useHallSync({ hallId, initialIds, onError: handleSyncError });

  const commit = useCallback(
    (next: EditorDoc) => {
      const prev = docRef.current;
      if (prev === next) return;
      historyRef.current = [...historyRef.current, prev].slice(-HISTORY_LIMIT);
      setHistoryLength(historyRef.current.length);
      sync(prev, next);
      setDocument(next);
    },
    [setDocument, sync]
  );

  const select = useCallback((key: string | null) => {
    if (selectedRef.current !== key) setInspectorTick((n) => n + 1);
    selectedRef.current = key;
    setSelectedKey(key);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const target = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    setHistoryLength(historyRef.current.length);
    sync(docRef.current, target);
    setDocument(target);
    select(null);
  }, [select, setDocument, sync]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if (e.key !== "z" && e.key !== "Z" && e.key !== "я" && e.key !== "Я") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // --- lookups -------------------------------------------------------------

  const selectedTable = doc.tables.find((t) => t.key === selectedKey) ?? null;
  const selectedObject = doc.objects.find((o) => o.key === selectedKey) ?? null;

  const reservationsByTableId = useMemo(() => {
    const map = new Map<number, TodayReservation[]>();
    for (const r of reservationsToday) {
      for (const id of r.table_ids) {
        const list = map.get(id) ?? [];
        list.push(r);
        map.set(id, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [reservationsToday]);

  const bookingsFor = useCallback(
    (key: string): TodayReservation[] => {
      const id = serverIdOf(key);
      return id === undefined ? [] : (reservationsByTableId.get(id) ?? []);
    },
    [serverIdOf, reservationsByTableId]
  );

  const tableStates = useMemo(() => {
    const map = new Map<string, TableVisualState>();
    for (const t of doc.tables) {
      let state: TableVisualState = "free";
      if (!t.is_active) state = "hidden";
      else if (t.manual_status === "out_of_service") state = "off";
      else if (t.manual_status === "occupied") state = "busy";
      else {
        const seatedNow = bookingsFor(t.key).some((r) => {
          if (r.status !== "pending" && r.status !== "confirmed") return false;
          const start = timeToMinutes(r.start_time);
          return nowMinutes >= start && nowMinutes < start + (r.duration_minutes ?? DEFAULT_DURATION_MINUTES);
        });
        if (seatedNow) state = "busy";
      }
      map.set(t.key, state);
    }
    return map;
  }, [doc.tables, bookingsFor, nowMinutes]);

  // --- edits ---------------------------------------------------------------

  /** Applies `patch` to one table/object if the result still fits the room
   * without overlapping anything; otherwise shakes it and explains. */
  const tryPatch = useCallback(
    (key: string, patch: Partial<EditorTable> & Partial<EditorObject>, failMessage = "Не помещается — рядом другие объекты") => {
      const current = docRef.current;
      const table = current.tables.find((t) => t.key === key);
      const object = current.objects.find((o) => o.key === key);
      const others = footprintsOf(current).filter((f) => f.key !== key);

      if (table) {
        const next: EditorTable = { ...table, ...(patch as Partial<EditorTable>) };
        const me = tableFootprint(key, next);
        const { x, y } = clampInside(me, next.pos_x, next.pos_y, planW, planH);
        if (collides(others, me, x, y)) {
          shake(key);
          showToast(failMessage);
          return;
        }
        commit({ ...current, tables: current.tables.map((t) => (t.key === key ? { ...next, pos_x: x, pos_y: y } : t)) });
        return;
      }
      if (object) {
        const next: EditorObject = { ...object, ...(patch as Partial<EditorObject>) };
        const me = objectFootprint(key, next);
        const { x, y } = clampInside(me, next.pos_x, next.pos_y, planW, planH);
        if (collides(others, me, x, y)) {
          shake(key);
          showToast(failMessage);
          return;
        }
        commit({ ...current, objects: current.objects.map((o) => (o.key === key ? { ...next, pos_x: x, pos_y: y } : o)) });
      }
    },
    [commit, planW, planH, shake, showToast]
  );

  const findItem = (key: string) =>
    docRef.current.tables.find((t) => t.key === key) ?? docRef.current.objects.find((o) => o.key === key);

  const move = useCallback((key: string, x: number, y: number) => tryPatch(key, { pos_x: x, pos_y: y }), [tryPatch]);

  const blocked = useCallback(
    (key: string) => {
      shake(key);
      showToast("Здесь занято — вернули на место");
    },
    [shake, showToast]
  );

  function nudge(key: string, dx: number, dy: number) {
    const item = findItem(key);
    if (item) tryPatch(key, { pos_x: item.pos_x + dx, pos_y: item.pos_y + dy }, "Дальше не сдвинуть — мешает соседний объект");
  }

  function rotate(key: string, delta: number) {
    const item = findItem(key);
    if (item) tryPatch(key, { rotation: normalizeRotation(item.rotation + delta) }, "Для поворота не хватает места");
  }

  function freeSpot(me: Footprint, preferred: { x: number; y: number }[] = []) {
    return findFreeSpot(footprintsOf(docRef.current), me, planW, planH, preferred);
  }

  function addTable(preset: TablePreset) {
    const current = docRef.current;
    const key = newKey("t");
    const draft: EditorTable = {
      key,
      label: nextTableLabel(current.tables),
      shape: preset.shape,
      min_capacity: preset.min,
      max_capacity: preset.max,
      pos_x: 0,
      pos_y: 0,
      rotation: 0,
      is_active: true,
      manual_status: null,
    };
    const spot = freeSpot(tableFootprint(key, draft));
    if (!spot) {
      showToast("В зале не осталось места — увеличьте размер зала");
      return;
    }
    commit({ ...current, tables: [...current.tables, { ...draft, pos_x: spot.x, pos_y: spot.y }] });
    select(key);
    spawn(key);
    showToast(`Стол ${draft.label} добавлен — перетащите на место`);
  }

  function addObject(kind: HallObjectKind) {
    const current = docRef.current;
    const meta = HALL_OBJECT_META[kind];
    const key = newKey("o");
    const draft: EditorObject = { key, kind, pos_x: 0, pos_y: 0, width: meta.w, height: meta.h, rotation: 0, label: meta.label };
    const spot = freeSpot(objectFootprint(key, draft));
    if (!spot) {
      showToast("Не нашли свободного места");
      return;
    }
    commit({ ...current, objects: [...current.objects, { ...draft, pos_x: spot.x, pos_y: spot.y }] });
    select(key);
    spawn(key);
    showToast(`Добавлено: ${meta.name.toLowerCase()}`);
  }

  function duplicate(key: string) {
    const current = docRef.current;
    const table = current.tables.find((t) => t.key === key);
    const object = current.objects.find((o) => o.key === key);
    const source = table ?? object;
    if (!source) return;
    const me = table ? tableFootprint(key, table) : objectFootprint(key, object!);
    const preferred = [
      { x: source.pos_x + me.w + GRID_CELL, y: source.pos_y },
      { x: source.pos_x, y: source.pos_y + me.h + GRID_CELL },
      { x: source.pos_x - me.w - GRID_CELL, y: source.pos_y },
      { x: source.pos_x, y: source.pos_y - me.h - GRID_CELL },
    ];
    if (table) {
      const copyKey = newKey("t");
      const copy: EditorTable = { ...table, key: copyKey, label: nextTableLabel(current.tables), manual_status: null };
      const spot = freeSpot(tableFootprint(copyKey, copy), preferred);
      if (!spot) {
        showToast("Нет места для копии");
        return;
      }
      commit({ ...current, tables: [...current.tables, { ...copy, pos_x: spot.x, pos_y: spot.y }] });
      select(copyKey);
      spawn(copyKey);
      return;
    }
    const copyKey = newKey("o");
    const copy: EditorObject = { ...object!, key: copyKey };
    const spot = freeSpot(objectFootprint(copyKey, copy), preferred);
    if (!spot) {
      showToast("Нет места для копии");
      return;
    }
    commit({ ...current, objects: [...current.objects, { ...copy, pos_x: spot.x, pos_y: spot.y }] });
    select(copyKey);
    spawn(copyKey);
  }

  function remove(key: string) {
    const current = docRef.current;
    const table = current.tables.find((t) => t.key === key);
    if (table) {
      const active = bookingsFor(key).filter((r) => r.status === "pending" || r.status === "confirmed").length;
      if (active > 0) {
        shake(key);
        showToast(`У стола ${table.label} есть брони сегодня (${active}) — сначала перенесите их`);
        return;
      }
      commit({ ...current, tables: current.tables.filter((t) => t.key !== key) });
      select(null);
      showToast(`Стол ${table.label} удалён`, true);
      return;
    }
    const object = current.objects.find((o) => o.key === key);
    if (!object) return;
    commit({ ...current, objects: current.objects.filter((o) => o.key !== key) });
    select(null);
    showToast(`${HALL_OBJECT_META[object.kind].name} удалён`, true);
  }

  // --- inspector -----------------------------------------------------------

  function setHallText(field: "name" | "description", value: string) {
    const current = docRef.current;
    const trimmed = value.trim();
    if (field === "name" && !trimmed) {
      showToast("Название зала не может быть пустым");
      return;
    }
    commit({ ...current, hall: { ...current.hall, [field]: trimmed } });
  }

  function resizeHall(dWidth: number, dLength: number) {
    const current = docRef.current;
    const width_m = Math.min(HALL_SIZE_MAX_M, Math.max(HALL_SIZE_MIN_M, current.hall.width_m + dWidth));
    const length_m = Math.min(HALL_SIZE_MAX_M, Math.max(HALL_SIZE_MIN_M, current.hall.length_m + dLength));
    const w = width_m * UNITS_PER_METER;
    const h = length_m * UNITS_PER_METER;
    const fits = footprintsOf(current).every((f) => f.x + f.w / 2 <= w && f.y + f.h / 2 <= h);
    if (!fits) {
      showToast("Сначала отодвиньте объекты от края — они не поместятся");
      return;
    }
    commit({ ...current, hall: { ...current.hall, width_m, length_m } });
  }

  function setTableLabel(value: string) {
    if (!selectedKey) return;
    const label = value.trim();
    if (!label) {
      showToast("Номер стола не может быть пустым");
      return;
    }
    if (docRef.current.tables.some((t) => t.key !== selectedKey && t.label === label)) {
      showToast(`Стол «${label}» уже есть в этом зале`);
      return;
    }
    tryPatch(selectedKey, { label });
  }

  function toggleOption(option: keyof PlanOptions) {
    const next = { ...options, [option]: !options[option] };
    setOptions(next);
    try {
      window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable - the toggle still applies for this visit.
    }
  }

  function zoomToFit() {
    const wrapper = scrollRef.current;
    if (!wrapper) {
      setZoom(100);
      return;
    }
    const fullHeight = (wrapper.clientWidth * planH) / planW;
    const maxHeight = window.innerHeight - 230;
    const fit = fullHeight > maxHeight ? Math.floor((maxHeight / fullHeight) * 100) : 100;
    setZoom(Math.max(ZOOM_MIN, Math.min(100, fit)));
  }

  // --- render --------------------------------------------------------------

  const seats = doc.tables.reduce((sum, t) => sum + t.max_capacity, 0);
  const busyCount = [...tableStates.values()].filter((s) => s === "busy").length;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            href="/hostess/halls"
            className="group inline-flex min-h-8 items-center gap-1.5 font-mono text-[11px] tracking-[0.16em] text-claret"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={2.2} aria-hidden="true" />
            ВСЕ ЗАЛЫ
          </Link>
          <div className="flex flex-wrap items-center gap-3.5">
            <h2 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em]">{doc.hall.name}</h2>
            <span role="status" className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 text-xs text-muted">
              <span
                className={`h-2 w-2 rounded-full ${pending > 0 ? "animate-breathe bg-status-pending" : "bg-status-confirmed"}`}
                aria-hidden="true"
              />
              {pending > 0 ? "Сохраняем…" : "Сохранено"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={undo} disabled={historyLength === 0} className={GHOST_BUTTON}>
            <Undo2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Отменить
            {historyLength > 0 && <span className="font-mono text-[11px] text-muted">{historyLength}</span>}
          </button>
          <div role="group" aria-label="Масштаб плана" className="inline-flex h-11 items-center gap-0.5 rounded-[13px] border border-line-strong bg-[#1a1311] px-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Уменьшить"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink disabled:opacity-35"
            >
              <Minus className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <span className="min-w-[46px] text-center font-mono text-xs tabular-nums" aria-live="polite">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Увеличить"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink disabled:opacity-35"
            >
              <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={zoomToFit}
              className="flex h-10 items-center rounded-[10px] px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
            >
              Вписать
            </button>
          </div>
          <button type="button" onClick={() => select(null)} className={GHOST_BUTTON}>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Настройки зала
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[212px_minmax(0,1fr)_300px]">
        <Palette onAddTable={addTable} onAddObject={addObject} />

        <div className="flex min-w-0 flex-col gap-3.5">
          <FloorPlanCanvas
            doc={doc}
            planW={planW}
            planH={planH}
            zoom={zoom}
            options={options}
            selectedKey={selectedKey}
            tableStates={tableStates}
            shakeKey={shakeKey}
            spawnKey={spawnKey}
            scrollRef={scrollRef}
            onSelect={select}
            onMove={move}
            onBlocked={blocked}
            onNudge={nudge}
            onRotate={rotate}
            onDuplicate={duplicate}
            onDelete={remove}
          />
          <div className="flex flex-wrap items-end gap-7 text-xs text-muted">
            <Stat value={`${metersLabel(planW)} × ${metersLabel(planH)} м`} label="размер зала" />
            <Stat value={doc.tables.length} label={pluralize(doc.tables.length, "стол", "стола", "столов")} />
            <Stat value={seats} label={pluralize(seats, "место", "места", "мест")} />
            <Stat value={doc.objects.length} label={pluralize(doc.objects.length, "объект", "объекта", "объектов")} />
            <Stat value={busyCount} label="занято" accent />
          </div>
        </div>

        <Inspector
          doc={doc}
          selectedTable={selectedTable}
          selectedObject={selectedObject}
          tableState={selectedTable ? (tableStates.get(selectedTable.key) ?? "free") : "free"}
          tableBookings={selectedTable ? bookingsFor(selectedTable.key) : []}
          options={options}
          animationKey={inspectorTick}
          onHallText={setHallText}
          onHallResize={resizeHall}
          onFloor={(floor) => commit({ ...docRef.current, hall: { ...docRef.current.hall, floor } })}
          onToggleOption={toggleOption}
          onTableLabel={setTableLabel}
          onTablePatch={(patch, failMessage) => {
            if (selectedKey) tryPatch(selectedKey, patch, failMessage);
          }}
          onObjectLabel={(label) => {
            if (selectedKey) tryPatch(selectedKey, { label: label.trim() });
          }}
          onObjectResize={(dw, dh) => {
            if (!selectedObject) return;
            tryPatch(selectedObject.key, {
              width: Math.max(20, selectedObject.width + dw),
              height: Math.max(10, selectedObject.height + dh),
            });
          }}
          onRotate={(delta) => {
            if (selectedKey) rotate(selectedKey, delta);
          }}
          onDuplicate={() => {
            if (selectedKey) duplicate(selectedKey);
          }}
          onDelete={() => {
            if (selectedKey) remove(selectedKey);
          }}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className="pointer-events-auto relative flex max-w-full items-center gap-3 overflow-hidden rounded-2xl bg-ink py-2.5 pl-4 pr-2.5 text-sm font-semibold text-paper shadow-[var(--shadow-floating)]"
          >
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  undo();
                  setToast(null);
                }}
                className="h-11 rounded-[10px] bg-paper px-3 font-bold text-ink transition-colors hover:bg-surface"
              >
                Вернуть
              </button>
            )}
            <motion.span
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-claret"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 3.6, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <span className="flex flex-col">
      <b className={`font-display text-2xl font-normal ${accent ? "text-status-confirmed" : "text-ink"}`}>{value}</b>
      {label}
    </span>
  );
}

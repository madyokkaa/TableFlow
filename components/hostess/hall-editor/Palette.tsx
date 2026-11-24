"use client";

import { HALL_OBJECT_KINDS, HALL_OBJECT_META, type HallObjectKind } from "@/lib/floorPlan";
import { tableSize, type TableShape } from "@/lib/tableShapes";
import { CAPTION } from "./controls";

export type TablePreset = { shape: TableShape; min: number; max: number; label: string };

export const TABLE_PRESETS: TablePreset[] = [
  { shape: "round", min: 1, max: 2, label: "Круглый · 2" },
  { shape: "round", min: 2, max: 4, label: "Круглый · 4" },
  { shape: "rectangle", min: 2, max: 4, label: "Прямоуг. · 4" },
  { shape: "rectangle", min: 4, max: 6, label: "Прямоуг. · 6" },
  { shape: "square", min: 2, max: 4, label: "Квадрат · 4" },
  { shape: "round", min: 6, max: 8, label: "Банкет · 8" },
];

const TILE =
  "flex h-[86px] flex-col items-center justify-center gap-2 rounded-[14px] border border-line bg-[#1a1311] p-1.5 text-center text-[11.5px] font-semibold leading-tight text-ink/80 transition-[transform,border-color,background-color,color] duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)] hover:-translate-y-[3px] hover:border-claret hover:bg-surface-raised hover:text-ink active:scale-[0.94]";

/** Left-hand palette: table presets and every hall object kind. Clicking
 * one drops it on the nearest free spot; the user then drags it into place. */
export function Palette({
  onAddTable,
  onAddObject,
}: {
  onAddTable: (preset: TablePreset) => void;
  onAddObject: (kind: HallObjectKind) => void;
}) {
  return (
    <aside
      aria-label="Палитра объектов"
      className="flex flex-col gap-3.5 rounded-[22px] border border-line bg-surface p-4 xl:sticky xl:top-[90px] xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto"
    >
      <span className={CAPTION}>Столы</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 xl:grid-cols-2">
        {TABLE_PRESETS.map((preset) => {
          const size = tableSize(preset.shape, preset.max);
          const k = Math.min(60 / size.w, 30 / size.h, 0.5);
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onAddTable(preset)}
              className={TILE}
              aria-label={`Добавить стол: ${preset.label}`}
            >
              <span className="flex h-[38px] w-16 items-center justify-center" aria-hidden="true">
                <span
                  className={`fp-ptbl ${preset.shape}`}
                  style={{ width: Math.round(size.w * k), height: Math.round(size.h * k) }}
                />
              </span>
              {preset.label}
            </button>
          );
        })}
      </div>

      <span className={CAPTION}>Зона и объекты</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 xl:grid-cols-2">
        {HALL_OBJECT_KINDS.map((kind) => {
          const meta = HALL_OBJECT_META[kind];
          const k = Math.min(60 / meta.w, 34 / meta.h);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onAddObject(kind)}
              className={TILE}
              aria-label={`Добавить: ${meta.name}`}
            >
              <span className="flex h-[38px] w-16 items-center justify-center" aria-hidden="true">
                <span
                  className={`fp-pobj k-${kind}`}
                  style={{ width: Math.max(6, Math.round(meta.w * k)), height: Math.max(4, Math.round(meta.h * k)) }}
                >
                  <span className="fp-dk" />
                </span>
              </span>
              {meta.name}
            </button>
          );
        })}
      </div>
      <span className="text-xs font-medium text-muted">Нажмите, чтобы добавить на свободное место, затем перетащите.</span>
    </aside>
  );
}

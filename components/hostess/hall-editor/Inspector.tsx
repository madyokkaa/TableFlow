"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Armchair, LayoutPanelTop, Square } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import {
  FLOOR_LABELS,
  FLOOR_TYPES,
  HALL_OBJECT_META,
  HALL_SIZE_MAX_M,
  HALL_SIZE_MIN_M,
  metersLabel,
  type FloorType,
} from "@/lib/floorPlan";
import type { EditorDoc, EditorObject, EditorTable } from "@/lib/hallEditor";
import { formatRuNumber, formatTime, pluralize } from "@/lib/ru";
import { tableSize, tableSizeCaption, type TableShape } from "@/lib/tableShapes";
import {
  ObjectArtwork,
  TableArtwork,
  pxUnits,
  tableBoxStyle,
  tableCapacityText,
  type TableVisualState,
} from "@/components/floor-plan/PlanShapes";
import type { PlanOptions } from "@/components/hostess/FloorPlanCanvas";
import { CAPTION, DANGER_BUTTON, Field, GHOST_BUTTON, GHOST_BUTTON_ON, INPUT, Segmented, Stepper, SwitchRow } from "./controls";

export type TableBooking = { id: number; start_time: string; guest_name: string; party_size: number; status: string };

export const MAX_TABLE_CAPACITY = 20;

const STATE_LABELS: Record<TableVisualState, { label: string; className: string }> = {
  free: { label: "Активен", className: "bg-status-confirmed-tint text-status-confirmed" },
  busy: { label: "Занят", className: "bg-status-pending-tint text-status-pending" },
  off: { label: "Не в работе", className: "bg-status-noshow-tint text-status-noshow" },
  hidden: { label: "Скрыт", className: "bg-status-noshow-tint text-status-noshow" },
};

const SHAPE_OPTIONS: { value: TableShape; label: string }[] = [
  { value: "rectangle", label: "Прямоуг." },
  { value: "round", label: "Круглый" },
  { value: "square", label: "Квадрат" },
];

/** A text field that only reports its value on blur / Enter, so a label
 * isn't saved on every keystroke. Remount it (key) to reset to a new value. */
function CommitInput({
  value,
  onCommit,
  placeholder,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  function commit() {
    if (draft !== value) onCommit(draft);
  }
  return (
    <input
      className={INPUT}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(value);
        }
      }}
    />
  );
}

function PanelHeader({ icon, caption, title, extra }: { icon: ReactNode; caption: string; title: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-claret/30 bg-[#2a1a1f] text-claret">
        {icon}
      </span>
      <div className="min-w-0">
        <span className={CAPTION}>{caption}</span>
        <b className="block truncate font-display text-[22px] font-normal leading-tight">{title}</b>
      </div>
      {extra}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line" />;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-6 items-center justify-center rounded-md border border-b-2 border-[#4a3833] bg-surface-raised px-1.5 font-mono text-[10.5px] text-ink/90">
      {children}
    </kbd>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-[#181210]"
      style={{
        backgroundImage: "linear-gradient(#211816 1px, transparent 1px), linear-gradient(90deg, #211816 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {children}
    </div>
  );
}

export function Inspector({
  doc,
  selectedTable,
  selectedObject,
  tableState,
  tableBookings,
  options,
  animationKey,
  onHallText,
  onHallResize,
  onFloor,
  onToggleOption,
  onTableLabel,
  onTablePatch,
  onObjectLabel,
  onObjectResize,
  onRotate,
  onDuplicate,
  onDelete,
}: {
  doc: EditorDoc;
  selectedTable: EditorTable | null;
  selectedObject: EditorObject | null;
  tableState: TableVisualState;
  tableBookings: TableBooking[];
  options: PlanOptions;
  animationKey: number;
  onHallText: (field: "name" | "description", value: string) => void;
  onHallResize: (dWidth: number, dLength: number) => void;
  onFloor: (floor: FloorType) => void;
  onToggleOption: (option: keyof PlanOptions) => void;
  onTableLabel: (value: string) => void;
  onTablePatch: (patch: Partial<EditorTable>, failMessage?: string) => void;
  onObjectLabel: (value: string) => void;
  onObjectResize: (dw: number, dh: number) => void;
  onRotate: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hall = doc.hall;

  let body: ReactNode;
  if (selectedTable) {
    const t = selectedTable;
    const size = tableSize(t.shape, t.max_capacity);
    const scale = Math.min(1.1, 150 / (Math.max(size.w, size.h) + 50));
    const unit = pxUnits(scale);
    const cap = tableCapacityText(t.min_capacity, t.max_capacity);
    const state = STATE_LABELS[tableState];
    body = (
      <>
        <PanelHeader
          icon={<Armchair className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />}
          caption="Стол"
          title={`№ ${t.label}`}
          extra={
            <span className={`ml-auto inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${state.className}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {state.label}
            </span>
          }
        />
        <Preview>
          <span
            className={`fp-obj fp-table fp-static ${t.shape} s-${tableState}`}
            style={{ position: "relative", ...tableBoxStyle(t.shape, t.max_capacity, unit), transform: `rotate(${t.rotation}deg)` }}
            aria-hidden="true"
          >
            <TableArtwork
              shape={t.shape}
              maxCapacity={t.max_capacity}
              label={t.label}
              capacityText={cap}
              rotation={t.rotation}
              unit={unit}
              fixedFont
            />
          </span>
        </Preview>
        <span className="text-center text-xs font-medium text-muted">
          {tableSizeCaption(t.shape, t.max_capacity, metersLabel)} · до {t.max_capacity}{" "}
          {pluralize(t.max_capacity, "гостя", "гостей", "гостей")}
        </span>
        <Field label="Номер / название">
          <CommitInput key={`${t.key}:${t.label}`} value={t.label} onCommit={onTableLabel} placeholder="12, VIP-1" maxLength={40} />
        </Field>
        <Field label="Форма">
          <Segmented
            label="Форма стола"
            options={SHAPE_OPTIONS}
            value={t.shape}
            onChange={(shape) => onTablePatch(shape === "round" ? { shape, rotation: 0 } : { shape })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Мин. мест">
            <Stepper
              value={t.min_capacity}
              decrementLabel="Меньше минимум мест"
              incrementLabel="Больше минимум мест"
              decrementDisabled={t.min_capacity <= 1}
              incrementDisabled={t.min_capacity >= t.max_capacity}
              onDecrement={() => onTablePatch({ min_capacity: t.min_capacity - 1 })}
              onIncrement={() => onTablePatch({ min_capacity: t.min_capacity + 1 })}
            />
          </Field>
          <Field label="Макс. мест">
            <Stepper
              value={t.max_capacity}
              decrementLabel="Меньше максимум мест"
              incrementLabel="Больше максимум мест"
              decrementDisabled={t.max_capacity <= Math.max(1, t.min_capacity)}
              incrementDisabled={t.max_capacity >= MAX_TABLE_CAPACITY}
              onDecrement={() => onTablePatch({ max_capacity: t.max_capacity - 1 })}
              onIncrement={() => onTablePatch({ max_capacity: t.max_capacity + 1 }, "Для большего стола не хватает места")}
            />
          </Field>
        </div>
        <SwitchRow checked={t.is_active} onChange={() => onTablePatch({ is_active: !t.is_active })}>
          Доступен для онлайн-брони
        </SwitchRow>
        <Field label="Ручной статус">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={t.manual_status === "occupied"}
              onClick={() => onTablePatch({ manual_status: "occupied" })}
              className={`${GHOST_BUTTON} h-11 px-3 text-xs ${t.manual_status === "occupied" ? GHOST_BUTTON_ON : ""}`}
            >
              Занят сейчас
            </button>
            <button
              type="button"
              aria-pressed={t.manual_status === "out_of_service"}
              onClick={() => onTablePatch({ manual_status: "out_of_service" })}
              className={`${GHOST_BUTTON} h-11 px-3 text-xs ${t.manual_status === "out_of_service" ? GHOST_BUTTON_ON : ""}`}
            >
              Не в работе
            </button>
            <button
              type="button"
              disabled={t.manual_status === null}
              onClick={() => onTablePatch({ manual_status: null })}
              className={`${GHOST_BUTTON} h-11 px-3 text-xs`}
            >
              Сбросить
            </button>
          </div>
        </Field>
        <Field label="Брони сегодня">
          {tableBookings.length === 0 ? (
            <span className="text-xs font-medium text-muted">Сегодня свободен весь день</span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tableBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-surface-raised px-2.5 py-2 text-xs font-normal">
                  <span className="min-w-0 truncate">
                    <b className="font-mono font-medium">{formatTime(b.start_time)}</b> · {b.guest_name.split(" ")[0]} · {b.party_size}
                  </span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onDuplicate} className={GHOST_BUTTON}>
            Дублировать
          </button>
          <button type="button" onClick={onDelete} className={`${GHOST_BUTTON} ${DANGER_BUTTON}`}>
            Удалить
          </button>
        </div>
      </>
    );
  } else if (selectedObject) {
    const o = selectedObject;
    const meta = HALL_OBJECT_META[o.kind];
    const k = Math.min(1, 200 / o.width, 110 / o.height, 200 / o.height, 110 / o.width);
    body = (
      <>
        <PanelHeader
          icon={<LayoutPanelTop className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />}
          caption="Объект"
          title={meta.name}
        />
        <Preview>
          <span
            className={`fp-pobj k-${o.kind}`}
            style={{
              width: Math.max(8, o.width * k),
              height: Math.max(6, o.height * k),
              transform: `rotate(${o.rotation}deg)`,
              transition: "transform .45s cubic-bezier(.3,1.4,.5,1), width .35s, height .35s",
            }}
            aria-hidden="true"
          >
            <ObjectArtwork />
          </span>
        </Preview>
        <Field label="Подпись на плане">
          <CommitInput key={`${o.key}:${o.label}`} value={o.label} onCommit={onObjectLabel} placeholder="Без подписи" maxLength={40} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Длина">
            <Stepper
              value={`${metersLabel(o.width)} м`}
              decrementLabel="Короче"
              incrementLabel="Длиннее"
              decrementDisabled={o.width <= 20}
              onDecrement={() => onObjectResize(-20, 0)}
              onIncrement={() => onObjectResize(20, 0)}
            />
          </Field>
          <Field label="Глубина">
            <Stepper
              value={`${metersLabel(o.height)} м`}
              decrementLabel="Меньше глубина"
              incrementLabel="Больше глубина"
              decrementDisabled={o.height <= 10}
              onDecrement={() => onObjectResize(0, -20)}
              onIncrement={() => onObjectResize(0, 20)}
            />
          </Field>
        </div>
        <Field label={`Поворот · ${o.rotation}°`}>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => onRotate(-90)} className={GHOST_BUTTON}>
              ↺ −90°
            </button>
            <button type="button" onClick={() => onRotate(90)} className={GHOST_BUTTON}>
              ↻ +90°
            </button>
          </div>
        </Field>
        <span className="text-xs font-medium text-muted">{meta.hint}</span>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onDuplicate} className={GHOST_BUTTON}>
            Дублировать
          </button>
          <button type="button" onClick={onDelete} className={`${GHOST_BUTTON} ${DANGER_BUTTON}`}>
            Удалить
          </button>
        </div>
      </>
    );
  } else {
    const area = Math.round(hall.width_m * hall.length_m);
    body = (
      <>
        <PanelHeader icon={<Square className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />} caption="Настройки зала" title={hall.name} />
        <Field label="Название">
          <CommitInput key={`name:${hall.name}`} value={hall.name} onCommit={(v) => onHallText("name", v)} maxLength={120} />
        </Field>
        <Field label="Описание для гостей">
          <CommitInput
            key={`desc:${hall.description}`}
            value={hall.description}
            onCommit={(v) => onHallText("description", v)}
            placeholder="Например: у панорамных окон"
            maxLength={2000}
          />
        </Field>
        <Field label="Размер зала">
          <div className="grid grid-cols-2 gap-2.5">
            <Stepper
              value={`${formatRuNumber(hall.width_m)} м`}
              decrementLabel="Уже"
              incrementLabel="Шире"
              decrementDisabled={hall.width_m - 1 < HALL_SIZE_MIN_M}
              incrementDisabled={hall.width_m + 1 > HALL_SIZE_MAX_M}
              onDecrement={() => onHallResize(-1, 0)}
              onIncrement={() => onHallResize(1, 0)}
            />
            <Stepper
              value={`${formatRuNumber(hall.length_m)} м`}
              decrementLabel="Короче"
              incrementLabel="Длиннее"
              decrementDisabled={hall.length_m - 1 < HALL_SIZE_MIN_M}
              incrementDisabled={hall.length_m + 1 > HALL_SIZE_MAX_M}
              onDecrement={() => onHallResize(0, -1)}
              onIncrement={() => onHallResize(0, 1)}
            />
          </div>
          <span className="text-xs font-medium text-muted">Ширина × длина в метрах, шаг 1 м · площадь {area} м²</span>
        </Field>
        <Field label="Покрытие пола">
          <Segmented
            label="Покрытие пола"
            options={FLOOR_TYPES.map((f) => ({ value: f, label: FLOOR_LABELS[f] }))}
            value={hall.floor}
            onChange={onFloor}
          />
        </Field>
        <Divider />
        <SwitchRow checked={options.grid} onChange={() => onToggleOption("grid")}>
          Сетка и привязка по 25 см
        </SwitchRow>
        <SwitchRow checked={options.magnet} onChange={() => onToggleOption("magnet")}>
          Магнит к соседним объектам
        </SwitchRow>
        <SwitchRow checked={options.seats} onChange={() => onToggleOption("seats")}>
          Показывать стулья
        </SwitchRow>
        <Divider />
        <div className="flex flex-col gap-2 text-xs text-muted">
          <span className={CAPTION}>Быстрые клавиши</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>сдвиг на 25 см, с Shift — на 1 м
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>R</Kbd>повернуть на 90°
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Kbd>Del</Kbd>удалить · <Kbd>Esc</Kbd>снять выделение
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd>отменить
          </span>
        </div>
      </>
    );
  }

  return (
    <motion.aside
      key={animationKey}
      aria-label="Свойства"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col gap-3.5 rounded-[22px] border border-line bg-surface p-4 xl:sticky xl:top-[90px] xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto"
    >
      {body}
    </motion.aside>
  );
}

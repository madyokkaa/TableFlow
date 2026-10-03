"use client";

import { ArrowRight, Minus, Plus, X } from "lucide-react";
import { addDaysIso } from "@/lib/scheduling";
import { formatTime, guestsLabel } from "@/lib/ru";
import type { DiningTable } from "@/components/hostess/TableForm";
import { capacityText } from "./GuestFloorPlan";

const CAPTION = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted";
const DAYS_SHOWN = 7;

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "пт, 3 октября" */
export function shortDayLabel(iso: string): string {
  return fromIso(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const progress = step === 3 ? 1 : step === 2 ? 0.5 : 0.04;
  const items = ["Стол", "Время", "Готово"];
  return (
    <div className="flex flex-col gap-2.5">
      <ol className="flex justify-between text-xs text-[#8f7c75]">
        {items.map((label, i) => {
          const on = i + 1 <= step;
          return (
            <li key={label} className={`inline-flex items-center gap-1.5 transition-colors duration-400 ${on ? "text-ink" : ""}`}>
              <i
                className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] not-italic transition-[background-color,border-color,color] duration-400 ${
                  on ? "border-claret bg-claret text-on-accent" : "border-[#4a3833]"
                }`}
                aria-hidden="true"
              >
                {i + 1}
              </i>
              {label}
            </li>
          );
        })}
      </ol>
      <div className="h-[3px] overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div
          className="h-full origin-left bg-claret transition-transform duration-700 ease-[cubic-bezier(0.6,0,0.2,1)]"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}

function DayStrip({ value, today, maxDate, onChange }: { value: string; today: string; maxDate: string; onChange: (iso: string) => void }) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysIso(today, i)).filter((iso) => iso <= maxDate);
  return (
    <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1.5 pt-1" role="group" aria-label="Дата">
      {days.map((iso, i) => {
        const date = fromIso(iso);
        const selected = iso === value;
        const top = i === 0 ? "сегодня" : i === 1 ? "завтра" : date.toLocaleDateString("ru-RU", { weekday: "short" });
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            aria-pressed={selected}
            aria-label={date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
            className={`flex h-[68px] min-w-12 flex-1 flex-col items-center justify-center gap-px rounded-[14px] border transition-[transform,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
              selected
                ? "-translate-y-[3px] border-ink bg-ink text-[#1d1614]"
                : "border-line-strong hover:-translate-y-0.5 hover:border-[#8a6a62]"
            }`}
          >
            <small className={`text-[11px] ${selected ? "text-[#5c4a44]" : "text-muted"}`}>{top}</small>
            <b className="font-display text-[22px] font-normal leading-[1.05]">{date.getDate()}</b>
            <small className={`text-[11px] ${selected ? "text-[#5c4a44]" : "text-muted"}`}>
              {date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function GuestStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const button =
    "flex h-11 w-11 items-center justify-center rounded-full border border-[#4a3833] bg-surface-raised transition-[transform,border-color] duration-200 hover:enabled:border-claret active:enabled:scale-[0.88] disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div className="flex items-center gap-3.5">
      <button type="button" className={button} disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label="Меньше гостей">
        <Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      {/* Re-keyed on change so the number "bounces" in each time. */}
      <span
        key={value}
        aria-live="polite"
        className="inline-block min-w-7 animate-[gp-bump_.4s_cubic-bezier(.3,1.6,.5,1)] text-center font-display text-[30px]"
      >
        {value}
      </span>
      <button type="button" className={button} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Больше гостей">
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="ml-auto flex flex-wrap justify-end gap-1" aria-hidden="true">
        {Array.from({ length: value }, (_, i) => (
          <i
            key={i}
            className="block h-3.5 w-2.5 animate-[gp-pop_.45s_cubic-bezier(.3,1.6,.5,1)_both] rounded-[4px_4px_2px_2px] bg-claret"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function TableCard({ table, hallName, onClear }: { table: DiningTable | null; hallName: string; onClear: () => void }) {
  if (!table) {
    return (
      <div className="flex items-center gap-3.5 rounded-[18px] border border-dashed border-line-strong p-3.5 text-[13px] text-muted">
        <svg
          width="44"
          height="44"
          viewBox="0 0 48 48"
          fill="none"
          stroke="#8f7c75"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="shrink-0 animate-[gp-float_3s_ease-in-out_infinite_alternate]"
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="10" />
          <rect x="20" y="5" width="8" height="5" rx="2" />
          <rect x="20" y="38" width="8" height="5" rx="2" />
          <rect x="5" y="20" width="5" height="8" rx="2" />
          <rect x="38" y="20" width="5" height="8" rx="2" />
        </svg>
        <span>Нажмите на стол на схеме — здесь появятся детали и свободное время.</span>
      </div>
    );
  }
  return (
    <div
      key={table.id}
      className="flex animate-[gp-slide_.55s_cubic-bezier(.2,.9,.3,1.2)_both] items-center gap-3.5 rounded-[18px] border border-line-strong bg-[#261d1a] p-3.5"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-claret font-display text-2xl text-on-accent">
        {table.label}
      </div>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="truncate text-[15px] font-bold">
          Стол {table.label} · {hallName.toLowerCase()}
        </div>
        <div className="text-[13px] text-muted">
          до {guestsLabel(table.max_capacity)} · {capacityText(table)}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Снять выбор стола"
        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-line hover:text-ink"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

function TimeSlots({
  tableId,
  times,
  available,
  value,
  onChange,
}: {
  tableId: number;
  times: string[];
  available: Set<string>;
  value: string | null;
  onChange: (time: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Время">
      {times.map((time, i) => {
        const taken = !available.has(time);
        const selected = time === value;
        return (
          <button
            key={`${tableId}-${time}`}
            type="button"
            disabled={taken}
            aria-pressed={selected}
            onClick={() => onChange(time)}
            style={{ animationDelay: `${i * 35}ms` }}
            className={`h-11 animate-[gp-slot_.45s_cubic-bezier(.2,.9,.3,1.3)_both] rounded-xl border font-mono text-[13px] transition-[transform,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)] ${
              selected
                ? "scale-[1.04] border-claret bg-claret text-on-accent"
                : taken
                  ? "cursor-not-allowed border-line-strong bg-transparent text-[#8f7c75] line-through"
                  : "border-line-strong bg-surface-raised hover:-translate-y-0.5 hover:border-claret"
            }`}
          >
            {formatTime(time)}
          </button>
        );
      })}
    </div>
  );
}

/** Right-hand booking panel: progress, date strip, party size, the chosen
 * table, its free times and the confirm button. */
export function BookingPanel({
  date,
  today,
  maxDate,
  onDateChange,
  partySize,
  maxPartySize,
  onPartySizeChange,
  table,
  hallName,
  onClearTable,
  times,
  availableTimes,
  availabilityLoading,
  availabilityError,
  time,
  onTimeChange,
  onSubmit,
}: {
  date: string;
  today: string;
  maxDate: string;
  onDateChange: (iso: string) => void;
  partySize: number;
  maxPartySize: number;
  onPartySizeChange: (n: number) => void;
  table: DiningTable | null;
  hallName: string;
  onClearTable: () => void;
  times: string[];
  availableTimes: Set<string>;
  availabilityLoading: boolean;
  availabilityError: string | null;
  time: string | null;
  onTimeChange: (time: string) => void;
  onSubmit: () => void;
}) {
  const step: 1 | 2 | 3 = table && time ? 3 : table ? 2 : 1;
  const dayLabel = shortDayLabel(date);
  const summary = !table
    ? "Выберите стол на схеме"
    : !time
      ? `Стол ${table.label} · ${dayLabel} · выберите время`
      : `Стол ${table.label} · ${dayLabel} · ${formatTime(time)} · ${guestsLabel(partySize)}`;
  const ctaText = !table ? "Выберите стол" : !time ? "Выберите время" : `Забронировать на ${formatTime(time)}`;

  return (
    <aside
      aria-label="Бронирование"
      className="flex animate-[gp-up_.7s_.2s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-[22px] rounded-3xl border border-line-strong bg-surface p-6 lg:sticky lg:top-5"
    >
      <Steps step={step} />

      <div className="flex flex-col gap-2.5">
        <span className={CAPTION}>Дата</span>
        <DayStrip value={date} today={today} maxDate={maxDate} onChange={onDateChange} />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={CAPTION}>Гостей</span>
        <GuestStepper value={partySize} max={maxPartySize} onChange={onPartySizeChange} />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={CAPTION}>Стол</span>
        <TableCard table={table} hallName={hallName} onClear={onClearTable} />
      </div>

      {table && (
        <div className="flex flex-col gap-2.5">
          <span className={CAPTION}>Время</span>
          {availabilityError ? (
            <p role="alert" className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-3 text-sm text-status-cancelled">
              {availabilityError}
            </p>
          ) : availabilityLoading ? (
            <div className="skeleton h-24 rounded-xl" />
          ) : availableTimes.size === 0 ? (
            <p className="text-sm text-muted">На этот день у стола нет свободного времени — выберите другую дату или стол.</p>
          ) : (
            <TimeSlots tableId={table.id} times={times} available={availableTimes} value={time} onChange={onTimeChange} />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="min-h-[18px] text-[13px] text-muted" aria-live="polite">
          {summary}
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!table || !time}
          className="gp-shine group relative flex h-[58px] w-full items-center justify-between overflow-hidden rounded-2xl bg-claret px-5 text-[15px] font-bold text-on-accent transition-[transform,box-shadow,background-color] duration-300 hover:enabled:shadow-[0_18px_40px_-16px_var(--color-claret)] active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:bg-line disabled:text-[#9c8a83]"
        >
          <span>{ctaText}</span>
          <ArrowRight
            className="h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)] group-hover:group-enabled:translate-x-[5px]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>
    </aside>
  );
}

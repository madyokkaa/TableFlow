"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

export const GHOST_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[13px] border border-line-strong bg-transparent px-4 text-[13px] font-semibold text-ink/90 transition-[border-color,background-color,color] duration-200 hover:border-[#8a6a62] hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40";
export const GHOST_BUTTON_ON = "border-claret bg-claret-tint text-claret hover:border-claret hover:bg-claret-tint";
export const DANGER_BUTTON = "text-status-cancelled hover:border-status-cancelled hover:bg-status-cancelled-tint";
export const INPUT =
  "h-11 w-full rounded-[13px] border border-line-strong bg-[#1a1311] px-3.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70 focus:border-claret focus:shadow-[0_0_0_4px_rgb(236_143_163/0.12)]";
export const CAPTION = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] font-semibold">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** −  value  + ; buttons are 44px tall for touch. */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  decrementDisabled,
  incrementDisabled,
}: {
  value: ReactNode;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
}) {
  const button =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors duration-200 hover:bg-[#2a201d] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div className="flex h-[50px] items-center justify-between rounded-[13px] border border-line-strong bg-[#1a1311] px-0.5">
      <button type="button" onClick={onDecrement} disabled={decrementDisabled} aria-label={decrementLabel} className={button}>
        <Minus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
      </button>
      <b className="whitespace-nowrap font-display text-[19px] font-normal tabular-nums">{value}</b>
      <button type="button" onClick={onIncrement} disabled={incrementDisabled} aria-label={incrementLabel} className={button}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Three-way segmented control with a sliding highlight. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid rounded-[14px] border border-line-strong bg-[#1a1311] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 h-11 rounded-[10px] border border-claret/30 bg-[#2e1c21] transition-transform duration-[450ms] ease-[cubic-bezier(0.3,1.3,0.5,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-[1] flex h-11 items-center justify-center truncate rounded-[10px] px-1.5 text-[13px] font-semibold transition-colors duration-300 ${
            option.value === value ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex min-h-11 w-full items-center gap-3 text-left text-[13px] text-ink/85"
    >
      <span
        aria-hidden="true"
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300 ${checked ? "bg-claret" : "bg-line-strong"}`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-ink transition-transform duration-[400ms] ease-[cubic-bezier(0.3,1.6,0.5,1)] ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      {children}
    </button>
  );
}

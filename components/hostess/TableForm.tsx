"use client";

import { useState, type FormEvent } from "react";

export type DiningTable = {
  id: number;
  hall_id: number;
  label: string;
  shape: "rectangle" | "round" | "square";
  min_capacity: number;
  max_capacity: number;
  pos_x: number;
  pos_y: number;
  is_active: boolean;
  manual_status: "occupied" | "out_of_service" | null;
};

const SHAPES: DiningTable["shape"][] = ["rectangle", "round", "square"];

export function TableForm({
  initial,
  submitting,
  error,
  onSubmit,
}: {
  initial?: DiningTable;
  submitting: boolean;
  error: string | null;
  onSubmit: (fields: { label: string; shape: DiningTable["shape"]; min_capacity: number; max_capacity: number; is_active: boolean }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [shape, setShape] = useState<DiningTable["shape"]>(initial?.shape ?? "rectangle");
  const [minCapacity, setMinCapacity] = useState(initial?.min_capacity ?? 2);
  const [maxCapacity, setMaxCapacity] = useState(initial?.max_capacity ?? 4);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const valid = label.trim().length > 0 && minCapacity > 0 && maxCapacity >= minCapacity;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ label: label.trim(), shape, min_capacity: minCapacity, max_capacity: maxCapacity, is_active: isActive });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Label</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={40}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="12, VIP-1, Terrace A…"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Shape</span>
        <div className="flex gap-2">
          {SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShape(s)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                shape === s ? "border-claret bg-claret-tint text-claret" : "border-line text-ink hover:border-claret"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Min seats</span>
          <input
            type="number"
            min={1}
            value={minCapacity}
            onChange={(e) => setMinCapacity(Math.max(1, Number(e.target.value) || 1))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Max seats</span>
          <input
            type="number"
            min={minCapacity}
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(Math.max(minCapacity, Number(e.target.value) || minCapacity))}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-claret" />
        <span className="text-ink">Bookable (uncheck to hide from new reservations)</span>
      </label>

      {error && <p className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !valid}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : initial ? "Save changes" : "Add table"}
      </button>
    </form>
  );
}

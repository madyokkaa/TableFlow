"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateLong } from "@/lib/ru";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthLabel(d: Date): string {
  const label = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Compact popover calendar - Monday-first, Russian month/weekday labels,
 * dates before `minDate` disabled (dimmed, not hidden). */
export function DatePicker({
  value,
  minDate,
  onChange,
}: {
  value: string;
  minDate?: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);
  const [viewMonth, setViewMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const min = minDate ? fromIso(minDate) : null;

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    // Capture phase + stopPropagation so Escape closes just this popover,
    // not an ancestor Modal that also listens for Escape on window.
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [open]);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  // getDay(): 0=Sunday..6=Saturday - shift so the grid starts on Monday.
  const leading = (viewMonth.getDay() + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  function isDisabled(d: Date): boolean {
    return min !== null && d < min;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-ink outline-none transition-colors focus:border-claret"
      >
        <span className="capitalize">{formatDateLong(value)}</span>
        <span aria-hidden="true" className="text-muted">
          📅
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Выбор даты"
          className="absolute left-0 top-[calc(100%+8px)] z-20 w-[280px] rounded-2xl border border-line bg-surface p-3 shadow-xl"
          style={{ animation: "modal-panel-in 150ms ease-out" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-ink">{monthLabel(viewMonth)}</span>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const disabled = isDisabled(d);
              const iso = toIso(d);
              const sel = iso === value;
              const today = iso === toIso(new Date());
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors duration-150 ${
                    sel
                      ? "bg-claret text-white"
                      : disabled
                        ? "cursor-not-allowed text-muted opacity-40"
                        : today
                          ? "border border-claret text-claret hover:bg-claret-tint"
                          : "text-ink hover:bg-paper"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

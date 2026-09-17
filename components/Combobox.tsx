"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type ComboboxOption<T extends string | number> = { value: T; label: string; sublabel?: string };

/** Closes on outside click or Escape. Escape is bound on `window` in the
 * CAPTURE phase (not React's onKeyDown) specifically so it fires - and can
 * stopPropagation() - before a parent Modal's own bubble-phase `window`
 * Escape listener ever sees the key: capture always runs before bubble for
 * listeners on the same node, regardless of which one was registered first.
 * Without this, Escape-to-close-the-dropdown also closed the whole modal
 * and discarded the form. */
function usePopoverDismiss(containerRef: React.RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [open, containerRef, onClose]);
}

function optionId(prefix: string, index: number): string {
  return `${prefix}-option-${index}`;
}

/** Single-select searchable dropdown - a compact select with a filter box,
 * used for fields with more options than a plain <select> scans well
 * (halls, statuses). */
export function Combobox<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = "Выберите…",
  ariaLabel,
}: {
  options: ComboboxOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function close() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }
  usePopoverDismiss(containerRef, open, close);

  function commit(option: ComboboxOption<T>) {
    onChange(option.value);
    close();
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) commit(option);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setHighlighted(0);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-ink outline-none transition-colors focus:border-claret"
      >
        <span className={selected ? "" : "text-muted"}>{selected?.label ?? placeholder}</span>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.75}
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-[200px] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
          style={{ animation: "modal-panel-in 150ms ease-out" }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={handleInputKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={filtered[highlighted] ? optionId(listId, highlighted) : undefined}
            placeholder="Поиск…"
            className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
          />
          <div id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Ничего не найдено</p>
            ) : (
              filtered.map((option, i) => (
                <button
                  key={option.value}
                  id={optionId(listId, i)}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => commit(option)}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors ${
                    i === highlighted ? "bg-paper" : ""
                  } ${option.value === value ? "text-claret" : "text-ink"}`}
                >
                  <span>{option.label}</span>
                  {option.sublabel && <span className="text-xs text-muted">{option.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Multi-select variant (checkbox list inside the same dropdown pattern) -
 * used for combining tables on a reservation. */
export function MultiCombobox<T extends string | number>({
  options,
  values,
  onChange,
  placeholder = "Выберите…",
  ariaLabel,
}: {
  options: ComboboxOption<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedOptions = options.filter((o) => values.includes(o.value));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function close() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }
  usePopoverDismiss(containerRef, open, close);

  function toggle(optionValue: T) {
    onChange(values.includes(optionValue) ? values.filter((v) => v !== optionValue) : [...values, optionValue]);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) toggle(option.value);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setHighlighted(0);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-ink outline-none transition-colors focus:border-claret"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted">{placeholder}</span>
        ) : (
          selectedOptions.map((o) => (
            <span key={o.value} className="rounded-md bg-claret-tint px-2 py-0.5 text-xs text-claret">
              {o.label}
            </span>
          ))
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-[220px] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
          style={{ animation: "modal-panel-in 150ms ease-out" }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={handleInputKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={filtered[highlighted] ? optionId(listId, highlighted) : undefined}
            placeholder="Поиск…"
            className="w-full border-b border-line bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
          />
          <div id={listId} role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Ничего не найдено</p>
            ) : (
              filtered.map((option, i) => {
                const checked = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    id={optionId(listId, i)}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      i === highlighted ? "bg-paper" : ""
                    } ${checked ? "text-claret" : "text-ink"}`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked ? "border-claret bg-claret text-white" : "border-line"
                      }`}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={2.5} />}
                    </span>
                    <span className="flex flex-col">
                      <span>{option.label}</span>
                      {option.sublabel && <span className="text-xs text-muted">{option.sublabel}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

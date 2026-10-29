const OPTIONS = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
] as const;

/** Two-option segmented control with a sliding claret-tinted indicator. */
export function PeriodSelector({ value, onChange }: { value: 7 | 30; onChange: (value: 7 | 30) => void }) {
  return (
    <div role="radiogroup" aria-label="Период" className="relative grid grid-cols-2 rounded-[12px] border border-line-strong bg-paper p-1">
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 h-9 w-[calc(50%-4px)] rounded-[9px] border border-[#4d2c36] bg-[#2e1c21] transition-transform duration-500 ease-[cubic-bezier(.3,1.3,.5,1)]"
        style={{ transform: `translateX(${value === 30 ? 100 : 0}%)` }}
      />
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative z-[1] h-9 px-3 text-xs font-semibold transition-colors ${value === opt.value ? "text-ink" : "text-muted hover:text-ink"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

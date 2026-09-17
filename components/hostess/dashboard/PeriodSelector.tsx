const OPTIONS = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
] as const;

export function PeriodSelector({ value, onChange }: { value: 7 | 30; onChange: (value: 7 | 30) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-paper/50 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value ? "bg-claret text-white" : "text-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

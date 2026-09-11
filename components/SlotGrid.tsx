export type AvailableSlot = {
  table_id: number;
  hall_id: number;
  hall_name: string | null;
  table_label: string;
  capacity: number;
  date: string;
  start_time: string;
  duration_minutes: number;
};

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function slotKey(slot: AvailableSlot): string {
  return `${slot.table_id}_${slot.start_time}`;
}

export function SlotGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-[84px] rounded-xl border border-line" />
      ))}
    </div>
  );
}

export function SlotGrid({
  slots,
  selectedSlotKey,
  onSelect,
}: {
  slots: AvailableSlot[];
  selectedSlotKey: string | null;
  onSelect: (slot: AvailableSlot) => void;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        No tables open at this size for that date. Try another date or a smaller party.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Available times">
      {slots.map((slot) => {
        const key = slotKey(slot);
        const selected = key === selectedSlotKey;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(slot)}
            className={`group flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-8px_rgb(var(--shadow-color)/0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claret ${
              selected
                ? "border-claret bg-claret text-white"
                : "border-line bg-surface text-ink hover:border-claret"
            }`}
          >
            <span className="font-mono text-base font-medium tabular-nums">{formatTime(slot.start_time)}</span>
            <span className={`text-xs ${selected ? "text-white/80" : "text-muted"}`}>
              {slot.hall_name ?? "Hall"} · Table {slot.table_label} · seats {slot.capacity}
            </span>
          </button>
        );
      })}
    </div>
  );
}

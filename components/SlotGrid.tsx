export type AvailableSlot = {
  slot_id: number;
  table_id: number;
  table_number: number;
  zone: string;
  capacity: number;
  date: string;
  start_time: string;
  duration_minutes: number;
};

function formatTime(time: string): string {
  return time.slice(0, 5);
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
  selectedSlotId,
  onSelect,
}: {
  slots: AvailableSlot[];
  selectedSlotId: number | null;
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
        const selected = slot.slot_id === selectedSlotId;
        return (
          <button
            key={slot.slot_id}
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
              Table {slot.table_number} · {slot.zone} · seats {slot.capacity}
            </span>
          </button>
        );
      })}
    </div>
  );
}

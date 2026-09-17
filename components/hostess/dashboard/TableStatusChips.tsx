import type { DashboardStats } from "@/lib/dashboard/types";

const ITEMS = [
  { key: "free", label: "Свободно", dot: "bg-status-confirmed" },
  { key: "occupied", label: "Занято", dot: "bg-status-pending" },
  { key: "outOfService", label: "Не в строю", dot: "bg-status-noshow" },
] as const;

export function TableStatusChips({ occupancy }: { occupancy: DashboardStats["occupancy"] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ITEMS.map((item) => (
        <div key={item.key} className="rounded-xl border border-line bg-paper/40 px-3 py-3 text-center">
          <span className={`mx-auto mb-1.5 block h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
          <p className="font-display text-xl text-ink tabular-nums">{occupancy[item.key]}</p>
          <p className="text-[11px] text-muted">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

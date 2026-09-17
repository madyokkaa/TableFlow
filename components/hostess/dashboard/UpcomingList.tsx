import { StatusPill } from "@/components/StatusPill";
import { guestsLabel } from "@/lib/ru";
import type { DashboardStats } from "@/lib/dashboard/types";

export function UpcomingList({ items }: { items: DashboardStats["upcoming"] }) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-muted">Броней на сегодня больше нет.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="font-mono text-sm text-ink tabular-nums">{r.startTime}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{r.guestName}</p>
            <p className="truncate text-xs text-muted">
              {guestsLabel(r.partySize)}
              {r.tables.length > 0 && ` · стол ${r.tables.join(", ")}`}
            </p>
          </div>
          <StatusPill status={r.status} />
        </li>
      ))}
    </ul>
  );
}

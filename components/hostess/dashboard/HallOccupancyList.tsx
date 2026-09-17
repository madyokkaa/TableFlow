import type { DashboardStats } from "@/lib/dashboard/types";

export function HallOccupancyList({ halls }: { halls: DashboardStats["halls"] }) {
  if (!halls.length) {
    return <p className="py-6 text-center text-sm text-muted">Залы ещё не добавлены.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {halls.map((hall) => (
        <li key={hall.hallId}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">{hall.name}</span>
            <span className="text-muted">
              {hall.occupied} из {hall.totalTables}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-claret transition-[width] duration-700 ease-out"
              style={{ width: `${hall.percent}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

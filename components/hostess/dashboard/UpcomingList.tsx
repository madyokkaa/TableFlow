import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { guestsLabel } from "@/lib/ru";
import { restaurantNowMinutes, timeToMinutes } from "@/lib/scheduling";
import type { DashboardStats } from "@/lib/dashboard/types";

function relativeLabel(startTime: string, nowMinutes: number): string {
  const diff = timeToMinutes(startTime) - nowMinutes;
  if (diff <= 0) return "идёт";
  if (diff < 60) return `через ${diff} мин`;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  // Past three hours the minutes are noise - and they would not fit.
  return minutes && hours < 3 ? `через ${hours}:${String(minutes).padStart(2, "0")}` : `через ${hours} ч`;
}

/** Today's next bookings; each row opens that booking on the bookings page. */
export function UpcomingList({ items }: { items: DashboardStats["upcoming"] }) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-muted">Броней на сегодня больше нет.</p>;
  }

  const nowMinutes = restaurantNowMinutes();
  return (
    <ul className="flex flex-col">
      {items.map((r, i) => (
        <li key={r.id} className="border-b border-[#2a201d] last:border-b-0">
          <Link
            href={`/hostess?reservation=${r.id}`}
            className="-mx-2 grid animate-[gp-up_.5s_both] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[#241b19]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="font-mono text-sm tabular-nums">
              {r.startTime}
              <small className="mt-0.5 block whitespace-nowrap text-[10px] text-claret">{relativeLabel(r.startTime, nowMinutes)}</small>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="truncate text-[13px]">{r.guestName}</b>
              <small className="truncate text-[11px] text-muted">
                {guestsLabel(r.partySize)}
                {r.tables.length > 0 && ` · стол ${r.tables.join(", ")}`}
              </small>
            </span>
            <StatusPill status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

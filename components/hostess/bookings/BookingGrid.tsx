"use client";

import { CLOSE_HOUR, OPEN_HOUR, timeToMinutes } from "@/lib/scheduling";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { Hall } from "@/components/hostess/HallForm";
import { TableChip } from "./BookingRow";
import type { Reservation } from "./types";

// The last booking can start at closing time and run past it - show two
// more hours so it isn't clipped.
const START = OPEN_HOUR * 60;
const END = (CLOSE_HOUR + 2) * 60;
const SPAN = END - START;
const HOURS = Array.from({ length: (END - START) / 60 }, (_, i) => OPEN_HOUR + i);

const BLOCK: Record<string, string> = {
  pending: "bg-[#3a2c14] text-[#f0cd86] shadow-[inset_0_0_0_1px_#6b5426]",
  confirmed: "bg-[#1d3226] text-[#a8dcbc] shadow-[inset_0_0_0_1px_#2f5a40]",
  completed: "bg-[#231d1b] text-[#a8958e] shadow-[inset_0_0_0_1px_#3a2c28]",
  "no-show": "bg-[#231d1b] text-[#8f7c75] shadow-[inset_0_0_0_1px_#3a2c28] line-through",
  cancelled: "bg-[repeating-linear-gradient(45deg,#231816_0_6px,#2a1c19_6px_12px)] text-[#b57a70] shadow-[inset_0_0_0_1px_#5a3530]",
};

const pct = (minutes: number) => `${((minutes - START) / SPAN) * 100}%`;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** «Шахматка»: one row per table, hours across, each booking a block from
 * its start for its duration, coloured by status. Clicking a block opens it;
 * clicking an empty spot starts a new booking on that table at that half
 * hour. Today gets a live «now» line. */
export function BookingGrid({
  tables,
  halls,
  reservations,
  nowMinutes,
  onOpen,
  onCreate,
}: {
  tables: DiningTable[];
  halls: Hall[];
  reservations: Reservation[];
  nowMinutes: number | null;
  onOpen: (reservation: Reservation) => void;
  onCreate: (tableId: number, hallId: number, time: string) => void;
}) {
  const hallName = new Map(halls.map((h) => [h.id, h.name]));
  const now = nowMinutes !== null && nowMinutes >= START && nowMinutes <= END ? nowMinutes : null;

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>, table: DiningTable) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = START + ((e.clientX - rect.left) / rect.width) * SPAN;
    const snapped = Math.min(CLOSE_HOUR * 60, Math.max(START, Math.floor(minutes / 30) * 30));
    onCreate(table.id, table.hall_id, hhmm(snapped));
  }

  if (tables.length === 0) {
    return <p className="rounded-[22px] border border-line bg-[#1a1412] px-4 py-12 text-center text-sm text-muted">В этом зале пока нет столов.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[22px] border border-line bg-[#1a1412]">
      <div className="relative min-w-[860px] px-4 pb-4 pt-3">
        <div className="grid h-7 grid-cols-[100px_minmax(0,1fr)] items-center font-mono text-[10.5px] text-[#8f7c75]">
          <span>СТОЛ</span>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
            {HOURS.map((h) => (
              <span key={h}>{String(h % 24).padStart(2, "0")}:00</span>
            ))}
          </div>
        </div>
        <div className="relative">
          {now !== null && (
            <div className="pointer-events-none absolute inset-y-0 left-[100px] right-0 z-[3]" aria-hidden="true">
              <span
                className="absolute inset-y-0 w-0.5 bg-claret after:absolute after:-bottom-1 after:-left-1 after:h-2.5 after:w-2.5 after:animate-breathe after:rounded-full after:bg-claret"
                style={{ left: pct(now) }}
              >
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-claret px-1.5 py-0.5 font-mono text-[10px] text-on-accent">
                  {hhmm(now)}
                </span>
              </span>
            </div>
          )}
          {tables.map((table, rowIndex) => {
            const rowBookings = reservations.filter((r) => r.reservation_tables.some((rt) => rt.table_id === table.id));
            return (
              <div
                key={table.id}
                className="grid h-[46px] animate-[gp-up_.45s_both] grid-cols-[100px_minmax(0,1fr)] items-center border-t border-[#241b19]"
                style={{ animationDelay: `${Math.min(rowIndex, 14) * 30}ms` }}
              >
                <div className="group flex min-w-0 items-center gap-1.5 text-[11px] text-[#b3a19a]">
                  <TableChip label={table.label} shape={table.shape} small />
                  <span className="truncate">{hallName.get(table.hall_id)}</span>
                </div>
                <div
                  className="relative h-full cursor-copy"
                  style={{
                    backgroundImage: "linear-gradient(90deg, #241b19 1px, transparent 1px)",
                    backgroundSize: `${100 / HOURS.length}% 100%`,
                  }}
                  onClick={(e) => handleTrackClick(e, table)}
                  title={`Новая бронь на стол ${table.label}`}
                >
                  {rowBookings.map((r, i) => {
                    const start = timeToMinutes(r.start_time);
                    const end = Math.min(END, start + r.duration_minutes);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onOpen(r)}
                        title={`${r.start_time.slice(0, 5)} · ${r.guest_name} · ${r.party_size} гост.`}
                        aria-label={`Стол ${table.label}, ${r.start_time.slice(0, 5)}, ${r.guest_name}`}
                        className={`absolute bottom-[7px] top-[7px] flex origin-left animate-[db-grow_.7s_cubic-bezier(.3,1.2,.5,1)_both] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[9px] px-2.5 text-[11.5px] font-semibold transition-[transform,box-shadow] duration-200 hover:z-[2] hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_#000] ${
                          BLOCK[r.status] ?? BLOCK.completed
                        }`}
                        style={{ left: pct(start), width: `calc(${((end - start) / SPAN) * 100}% - 3px)`, animationDelay: `${200 + i * 60}ms` }}
                      >
                        {r.start_time.slice(0, 5)} · {r.guest_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

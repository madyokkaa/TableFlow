import { CLOSE_HOUR, OPEN_HOUR, rangesOverlap, timeToMinutes } from "./scheduling";

/** Statuses that still hold a table - everything else frees it. */
export const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

export const SLOT_STEP_MINUTES = 30;

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Every half-hour start time the staff drawer offers, opening to closing
 * inclusive ("12:00" … "22:00"). An existing booking's own off-grid time
 * (e.g. "19:15") is merged in so editing never silently moves it. */
export function staffSlots(extra?: string): string[] {
  const slots: string[] = [];
  for (let m = OPEN_HOUR * 60; m <= CLOSE_HOUR * 60; m += SLOT_STEP_MINUTES) slots.push(hhmm(m));
  const own = extra?.slice(0, 5);
  if (own && !slots.includes(own)) {
    slots.push(own);
    slots.sort();
  }
  return slots;
}

export type SlotBooking = {
  id: number;
  start_time: string;
  duration_minutes: number;
  status: string;
  table_ids: number[];
};

/** Start times (from `slots`) at which a booking of `durationMinutes` on any
 * of `tableIds` would overlap another active booking - the ones the drawer
 * crosses out. The booking being edited (`excludeId`) never blocks itself. */
export function takenSlots(
  slots: string[],
  bookings: SlotBooking[],
  tableIds: number[],
  durationMinutes: number,
  excludeId?: number
): Set<string> {
  const blocking = bookings.filter(
    (b) =>
      b.id !== excludeId &&
      (ACTIVE_STATUSES as readonly string[]).includes(b.status) &&
      b.table_ids.some((id) => tableIds.includes(id))
  );
  const taken = new Set<string>();
  for (const slot of slots) {
    const start = timeToMinutes(slot);
    const end = start + durationMinutes;
    if (blocking.some((b) => rangesOverlap(start, end, timeToMinutes(b.start_time), timeToMinutes(b.start_time) + b.duration_minutes))) {
      taken.add(slot);
    }
  }
  return taken;
}

/** Shared opening-hours/slot-interval constants for availability generation
 * and demo seeding - single source of truth so they can't drift apart. */
export const OPEN_HOUR = 12;
export const CLOSE_HOUR = 22;
export const DEFAULT_DURATION_MINUTES = 90;
// Interval == duration so a single table's generated candidate times never
// overlap each other.
export const SLOT_INTERVAL_MINUTES = DEFAULT_DURATION_MINUTES;

export function candidateStartTimes(): string[] {
  const times: string[] = [];
  let minutesFromMidnight = OPEN_HOUR * 60;
  const closeMinutes = CLOSE_HOUR * 60;
  while (minutesFromMidnight <= closeMinutes) {
    const h = Math.floor(minutesFromMidnight / 60).toString().padStart(2, "0");
    const m = (minutesFromMidnight % 60).toString().padStart(2, "0");
    times.push(`${h}:${m}:00`);
    minutesFromMidnight += SLOT_INTERVAL_MINUTES;
  }
  return times;
}

/** [start, end) in minutes-since-midnight, for simple overlap checks. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

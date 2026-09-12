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

// The restaurant's fixed local offset (Europe/Moscow, UTC+3 - Russia hasn't
// observed DST since 2014, so a plain fixed offset is safe here). Both the
// guest client (picking "today") and the server (filtering elapsed slots)
// need to agree on what "today"/"now" means in the restaurant's clock, not
// the browser's or the server's own timezone - comparing a restaurant
// wall-clock time against server UTC-of-day (as the code briefly did) is
// off by this many hours for anyone not in UTC+0.
export const RESTAURANT_UTC_OFFSET_MINUTES = 180;

function restaurantLocalNow(): Date {
  return new Date(Date.now() + RESTAURANT_UTC_OFFSET_MINUTES * 60_000);
}

/** Today's date in the restaurant's local timezone, as YYYY-MM-DD - safe to
 * call from either the browser or the server, since it never touches the
 * caller's own timezone. */
export function restaurantTodayIso(): string {
  const d = restaurantLocalNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Minutes since midnight, restaurant local time. */
export function restaurantNowMinutes(): number {
  const d = restaurantLocalNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

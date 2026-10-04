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

// The restaurant's local time is the time zone of the device in use - the
// hostess's tablet, the guest's phone - picked up automatically from the
// browser (IANA name, so daylight-saving rules come for free). The browser
// shares it with the server (the `x-timezone` header on apiFetch, the `tz`
// cookie on plain fetches) so both agree on "today"/"now"; see
// lib/requestTimeZone.ts. The fallback, used only when no zone is known
// (e.g. a server call with neither), is the zone the app used before.
export const FALLBACK_TIME_ZONE = "Europe/Moscow";
export const TIME_ZONE_COOKIE = "tz";
export const TIME_ZONE_HEADER = "x-timezone";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's own IANA time zone; undefined on the server. */
export function deviceTimeZone(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : undefined;
}

// Remember the device's zone in a cookie as soon as this module loads in the
// browser - before any component fetches - so even plain (cookie-carrying)
// requests tell the server which zone "today" is in.
if (typeof document !== "undefined") {
  const zone = deviceTimeZone();
  if (zone) document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
}

function wallClock(timeZone?: string, at = Date.now()) {
  const zone = timeZone ?? deviceTimeZone() ?? FALLBACK_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Today's date in the restaurant's time zone (the device's, or `timeZone`
 * when given - the server passes the one the request reported), as
 * YYYY-MM-DD. */
export function restaurantTodayIso(timeZone?: string): string {
  const c = wallClock(timeZone);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/** Minutes since midnight, restaurant local time. */
export function restaurantNowMinutes(timeZone?: string): number {
  const c = wallClock(timeZone);
  return c.hour * 60 + c.minute;
}

/** The zone's offset from UTC in minutes at `at` (e.g. 300 for UTC+5). */
export function timeZoneOffsetMinutes(timeZone?: string, at = Date.now()): number {
  const c = wallClock(timeZone, at);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
  return Math.round((asUtc - (at - (at % 60_000))) / 60_000);
}

// How far out a reservation may be dated. Without this, an anonymous guest
// (booking needs no session at all - see POST /api/reservations) could park
// a table on a date decades out and hold it forever: the EXCLUDE constraint
// treats any 'pending'/'confirmed' row as blocking, with nothing to ever
// expire it. A bounded window turns "unbookable forever" into "unbookable
// for MAX_ADVANCE_BOOKING_DAYS", which staff can actually clean up.
export const MAX_ADVANCE_BOOKING_DAYS = 90;

/** The latest date a reservation may be made for, in the restaurant's local
 * timezone, as YYYY-MM-DD. */
export function maxAdvanceBookingDateIso(timeZone?: string): string {
  return addDaysIso(restaurantTodayIso(timeZone), MAX_ADVANCE_BOOKING_DAYS);
}

/** Adds (or subtracts, for negative `days`) whole days to a YYYY-MM-DD date,
 * treating it as a plain calendar date (no timezone). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

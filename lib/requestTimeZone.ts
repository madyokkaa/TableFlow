import {
  FALLBACK_TIME_ZONE,
  TIME_ZONE_COOKIE,
  TIME_ZONE_HEADER,
  isValidTimeZone,
  maxAdvanceBookingDateIso,
  restaurantTodayIso,
} from "./scheduling";

/** "Today" and the furthest bookable date for checks that enforce rules
 * (no booking in the past, no cancelling a past booking, the advance
 * window). The client's zone is input it controls - spoofing a far-off zone
 * would shift "today" by up to a day - so it is never trusted on its own:
 * RESTAURANT_TIME_ZONE wins when configured, otherwise the stricter of the
 * client's zone and the fallback zone applies (the later "today", the
 * earlier last bookable date). Display-only uses keep requestTimeZone. */
export function enforcedDates(request: Request): { today: string; maxDate: string } {
  const configured = process.env.RESTAURANT_TIME_ZONE;
  const zones =
    configured && isValidTimeZone(configured)
      ? [configured]
      : [...new Set([requestTimeZone(request), FALLBACK_TIME_ZONE].filter((z): z is string => !!z))];
  const todays = zones.map((z) => restaurantTodayIso(z)).sort();
  const maxDates = zones.map((z) => maxAdvanceBookingDateIso(z)).sort();
  return { today: todays[todays.length - 1], maxDate: maxDates[0] };
}

/** The caller's time zone as the browser reported it - the `x-timezone`
 * header (apiFetch) or the `tz` cookie (any same-origin request) - when it's
 * a real IANA zone. Undefined otherwise, and the scheduling helpers then use
 * their fallback. Only ever used to decide what "today"/"now" is for this
 * request; never trusted for anything else. */
export function requestTimeZone(request: Request): string | undefined {
  const fromHeader = request.headers.get(TIME_ZONE_HEADER)?.trim();
  if (fromHeader && isValidTimeZone(fromHeader)) return fromHeader;

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TIME_ZONE_COOKIE}=([^;]+)`));
  if (!match) return undefined;
  try {
    const fromCookie = decodeURIComponent(match[1]).trim();
    return isValidTimeZone(fromCookie) ? fromCookie : undefined;
  } catch {
    return undefined;
  }
}

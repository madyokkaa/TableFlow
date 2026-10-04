import { TIME_ZONE_COOKIE, TIME_ZONE_HEADER, isValidTimeZone } from "./scheduling";

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

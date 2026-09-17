/** Small date helpers shared by the dashboard's aggregation queries - kept
 * separate from lib/scheduling.ts since these operate on plain YYYY-MM-DD
 * calendar arithmetic and range-literal parsing, not restaurant-local "now". */

/** Adds (or subtracts, for negative `days`) whole days to a YYYY-MM-DD date,
 * treating it as a plain calendar date (no timezone). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Parses a Postgres tstzrange literal as returned by PostgREST, e.g.
 * `["2026-09-17 18:00:00+00","2026-09-17 19:30:00+00")`, into millisecond
 * timestamps. Returns null for anything that doesn't match, so a caller can
 * skip that row rather than throw over one malformed range. */
export function parseTstzRange(raw: string): { start: number; end: number } | null {
  const match = raw.match(/^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/);
  if (!match) return null;
  const start = Date.parse(match[1]);
  const end = Date.parse(match[2]);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

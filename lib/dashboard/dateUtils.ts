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

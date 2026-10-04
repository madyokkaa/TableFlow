import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

// Halls and tables change only when staff edit them, yet nearly every page
// reads them. One shared in-memory copy per tab: concurrent callers share a
// single request, and a fresh copy is fetched after a minute or as soon as
// anything writes to /api/halls or /api/tables (see apiFetch).
const TTL_MS = 60_000;

type FloorData = { halls: Hall[]; tables: DiningTable[] };

let cached: { at: number; promise: Promise<FloorData> } | null = null;

async function fetchFloorData(): Promise<FloorData> {
  const [hallsRes, tablesRes] = await Promise.all([fetch("/api/halls"), fetch("/api/tables")]);
  if (!hallsRes.ok || !tablesRes.ok) throw Object.assign(new Error("floor data unavailable"), { response: !hallsRes.ok ? hallsRes : tablesRes });
  const [halls, tables] = (await Promise.all([hallsRes.json(), tablesRes.json()])) as [Hall[], DiningTable[]];
  return { halls, tables };
}

/** All halls and all tables, from the shared cache when fresh. A failed
 * fetch isn't cached, so the next call retries. The error carries the
 * failing `response` for callers that want to show its message. */
export function getFloorData(): Promise<FloorData> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = fetchFloorData();
  cached = { at: Date.now(), promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

export function invalidateFloorData() {
  cached = null;
}

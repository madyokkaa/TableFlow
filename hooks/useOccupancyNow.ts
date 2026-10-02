"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { OccupancyNow } from "@/lib/dashboard/types";
import { useReservationsRealtime } from "./useReservationsRealtime";

// Occupancy also changes with the clock alone (a booking's start time
// arriving, a walk-in override on a table), which no reservation event
// announces - a once-a-minute refresh covers those.
const REFRESH_MS = 60_000;

/** Live "how many tables are taken right now" figure for the staff
 * sidebar. */
export function useOccupancyNow() {
  const [occupancy, setOccupancy] = useState<OccupancyNow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dashboard/occupancy");
      if (!res.ok) return;
      setOccupancy(await res.json());
    } catch {
      // Silent - the ring just keeps its last value until the next refresh.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useReservationsRealtime(() => load(), undefined, "hostess-reservations-occupancy");

  return occupancy;
}

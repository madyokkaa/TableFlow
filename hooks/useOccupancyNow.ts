"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { OccupancyNow } from "@/lib/dashboard/types";
import { useReservationsReload } from "./useReservationsRealtime";

// Occupancy also changes with the clock alone (a booking's start time
// arriving, a walk-in override on a table), which no reservation event
// announces - a once-a-minute refresh covers those. Only while the tab is
// visible: a background tab catches up the moment it's shown again.
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useReservationsReload(load);

  return occupancy;
}

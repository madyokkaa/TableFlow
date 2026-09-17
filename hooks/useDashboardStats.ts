"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, parseError } from "@/lib/api";
import type { DashboardStats } from "@/lib/dashboard/types";
import { useReservationsRealtime } from "./useReservationsRealtime";

/** Loads /api/dashboard/stats for the given period, and keeps it fresh:
 * refetches on period change and whenever any reservation changes
 * (realtime), matching the refresh pattern the rest of the hostess panel
 * already uses instead of polling. */
export function useDashboardStats(period: 7 | 30) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/dashboard/stats?period=${period}`);
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      setStats(await res.json());
    } catch {
      setError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/period-change, the canonical Effects use case
    load();
  }, [load]);

  useReservationsRealtime(() => load(), undefined, "hostess-reservations-dashboard");

  return { stats, loading, error, reload: load };
}

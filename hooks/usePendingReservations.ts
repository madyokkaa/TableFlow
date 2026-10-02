"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useReservationsRealtime } from "./useReservationsRealtime";

/** The fields of a /api/reservations row the staff shell's pending-booking
 * badge and bell dropdown actually read. */
export type PendingReservation = {
  id: number;
  date: string;
  start_time: string;
  guest_name: string;
  party_size: number;
  reservation_tables: { dining_tables: { label: string } | null }[];
};

/** Every reservation still awaiting confirmation, kept live: fetched on mount
 * and re-fetched whenever any reservation changes, so the badge and the
 * bell's list stay accurate from any page in the panel. `remove` drops a row
 * right away after this client resolves it, ahead of the realtime refetch. */
export function usePendingReservations() {
  const [items, setItems] = useState<PendingReservation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/reservations?status=pending");
      if (!res.ok) return;
      setItems(await res.json());
    } catch {
      // Silent - a stale/missing badge isn't worth surfacing an error for;
      // the next realtime event retries.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  useReservationsRealtime(() => load(), undefined, "hostess-reservations-badge");

  const remove = useCallback((id: number) => {
    setItems((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  return { items, remove };
}

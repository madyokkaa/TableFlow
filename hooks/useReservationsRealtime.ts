"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type ReservationChangeEvent = {
  eventType: "INSERT" | "UPDATE";
  reservationId: number;
};

export type RealtimeStatus = "SUBSCRIBED" | "DISCONNECTED";

/** Live updates for the hostess dashboard / floor plan via Postgres Changes
 * (WebSocket) instead of polling. Delivers only {eventType, reservationId} -
 * callers re-fetch just that one reservation's joined state and patch it
 * into their own list, rather than reloading everything on every change.
 *
 * Only INSERT/UPDATE are subscribed - nothing in this app ever deletes a
 * reservation (cancelling is a status update), and Realtime's RLS handling
 * of DELETE is the weakest part of its guarantees (the payload only carries
 * replica-identity columns, so policies referencing other columns can't be
 * evaluated) - no reason to take on that surface for an event that never
 * fires. */
export function useReservationsRealtime(
  onChange: (event: ReservationChangeEvent) => void,
  onStatusChange?: (status: RealtimeStatus) => void
) {
  const onChangeRef = useRef(onChange);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("hostess-reservations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservations" },
        (payload) => {
          const row = payload.new as { id: number } | null;
          if (!row) return;
          onChangeRef.current({ eventType: "INSERT", reservationId: row.id });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reservations" },
        (payload) => {
          const row = payload.new as { id: number } | null;
          if (!row) return;
          onChangeRef.current({ eventType: "UPDATE", reservationId: row.id });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reservation_tables" },
        (payload) => {
          const row = payload.new as { reservation_id: number } | null;
          if (!row) return;
          // A table added onto a combine changes what the parent
          // reservation's row should show (and, on the floor plan, which
          // tables read as reserved) - treat it as an UPDATE on that
          // reservation rather than its own event type.
          onChangeRef.current({ eventType: "UPDATE", reservationId: row.reservation_id });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reservation_tables" },
        (payload) => {
          const row = payload.new as { reservation_id: number } | null;
          if (!row) return;
          onChangeRef.current({ eventType: "UPDATE", reservationId: row.reservation_id });
        }
      )
      .subscribe((status) => {
        onStatusChangeRef.current?.(status === "SUBSCRIBED" ? "SUBSCRIBED" : "DISCONNECTED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

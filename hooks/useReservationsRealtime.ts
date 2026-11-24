"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type ReservationChangeEvent = {
  eventType: "INSERT" | "UPDATE";
  reservationId: number;
};

export type RealtimeStatus = "SUBSCRIBED" | "DISCONNECTED";

type Listener = {
  onChange: (event: ReservationChangeEvent) => void;
  onStatus?: (status: RealtimeStatus) => void;
};

// One Postgres Changes channel per browser tab, shared by every hook that
// listens (the shell's badge and occupancy ring, the page's own list...),
// instead of one WebSocket subscription per hook.
const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let status: RealtimeStatus = "DISCONNECTED";
let teardownTimer: number | undefined;

function emit(event: ReservationChangeEvent) {
  listeners.forEach((l) => l.onChange(event));
}

function openChannel() {
  const supabase = createBrowserSupabaseClient();
  channel = supabase
    .channel("hostess-reservations")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reservations" }, (payload) => {
      const row = payload.new as { id: number } | null;
      if (row) emit({ eventType: "INSERT", reservationId: row.id });
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reservations" }, (payload) => {
      const row = payload.new as { id: number } | null;
      if (row) emit({ eventType: "UPDATE", reservationId: row.id });
    })
    // A table added onto a combine changes what the parent reservation's row
    // should show (and, on the floor plan, which tables read as reserved) -
    // treat it as an UPDATE on that reservation rather than its own event.
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reservation_tables" }, (payload) => {
      const row = payload.new as { reservation_id: number } | null;
      if (row) emit({ eventType: "UPDATE", reservationId: row.reservation_id });
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reservation_tables" }, (payload) => {
      const row = payload.new as { reservation_id: number } | null;
      if (row) emit({ eventType: "UPDATE", reservationId: row.reservation_id });
    })
    .subscribe((next) => {
      status = next === "SUBSCRIBED" ? "SUBSCRIBED" : "DISCONNECTED";
      listeners.forEach((l) => l.onStatus?.(status));
    });
}

function subscribe(listener: Listener): () => void {
  window.clearTimeout(teardownTimer);
  listeners.add(listener);
  if (!channel) openChannel();
  else listener.onStatus?.(status);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    // Every /hostess page mounts its own shell, so moving between pages
    // briefly drops to zero listeners - keep the channel through that gap
    // instead of reconnecting on every navigation.
    teardownTimer = window.setTimeout(() => {
      if (listeners.size > 0 || !channel) return;
      createBrowserSupabaseClient().removeChannel(channel);
      channel = null;
      status = "DISCONNECTED";
    }, 5_000);
  };
}

/** Live updates for the staff panel via Postgres Changes (WebSocket)
 * instead of polling. Delivers only {eventType, reservationId} - callers
 * re-fetch just that one reservation's joined state and patch it into their
 * own list, rather than reloading everything on every change.
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

  useEffect(
    () =>
      subscribe({
        onChange: (event) => onChangeRef.current(event),
        onStatus: (next) => onStatusChangeRef.current?.(next),
      }),
    []
  );
}

/** For hooks that just reload their whole figure on any change: one booking
 * fires several events (the reservation row plus each of its tables), so
 * those are coalesced into a single reload shortly after the last one. */
export function useReservationsReload(reload: () => void, delayMs = 400) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useReservationsRealtime(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => reloadRef.current(), delayMs);
  });
}

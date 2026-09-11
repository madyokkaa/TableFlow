"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { StatusPill } from "@/components/StatusPill";

type Booking = {
  id: number;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  party_size: number;
  status: "pending" | "confirmed" | "cancelled" | "no-show";
  slots: {
    date: string;
    start_time: string;
    restaurant_tables: { number: number; zone: string } | null;
  };
};

const NEXT_ACTIONS: Record<Booking["status"], { label: string; status: string; tone: "confirm" | "cancel" }[]> = {
  pending: [
    { label: "Confirm", status: "confirmed", tone: "confirm" },
    { label: "Cancel", status: "cancelled", tone: "cancel" },
  ],
  confirmed: [
    { label: "No-show", status: "no-show", tone: "cancel" },
    { label: "Cancel", status: "cancelled", tone: "cancel" },
  ],
  cancelled: [],
  "no-show": [],
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HostessDashboard() {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/bookings/by-date/${date}`);
    if (res.status === 401) {
      router.replace("/hostess/login");
      return;
    }
    const body = await res.json();
    setBookings(res.ok ? body : []);
    setLoading(false);
  }, [date, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    load();
  }, [load]);

  async function handleAction(bookingId: number, newStatus: string) {
    setPendingActionId(bookingId);
    setActionError(null);
    const res = await apiFetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    setPendingActionId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error ?? "Couldn't update that booking.");
      return;
    }
    load();
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/hostess/login");
  }

  const sorted = bookings
    ? [...bookings].sort((a, b) => a.slots.start_time.localeCompare(b.slots.start_time))
    : [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow · Staff</p>
          <h1 className="mt-1 font-display text-3xl text-ink text-balance">Today&apos;s bookings</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-claret"
          />
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      {actionError && (
        <p className="mb-4 rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
          {actionError}
        </p>
      )}

      {loading || bookings === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl border border-line" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          No bookings for this date.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {sorted.map((booking) => (
            <div key={booking.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="w-16 shrink-0 font-mono text-sm font-medium tabular-nums text-ink">
                {booking.slots.start_time.slice(0, 5)}
              </div>
              <div className="w-28 shrink-0 text-sm text-muted">
                {booking.slots.restaurant_tables
                  ? `T${booking.slots.restaurant_tables.number} · ${booking.slots.restaurant_tables.zone}`
                  : "—"}
              </div>
              <div className="min-w-[140px] flex-1">
                <p className="text-sm font-medium text-ink">
                  {booking.guest_name} <span className="text-muted">· {booking.party_size}p</span>
                </p>
                <p className="text-xs text-muted">{booking.guest_phone || booking.guest_email}</p>
              </div>
              <StatusPill status={booking.status} />
              <div className="flex shrink-0 gap-2">
                {NEXT_ACTIONS[booking.status].map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    disabled={pendingActionId === booking.id}
                    onClick={() => handleAction(booking.id, action.status)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      action.tone === "confirm"
                        ? "border-status-confirmed text-status-confirmed hover:bg-status-confirmed-tint"
                        : "border-status-cancelled text-status-cancelled hover:bg-status-cancelled-tint"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BookingForm } from "@/components/BookingForm";
import { SlotGrid, SlotGridSkeleton, type AvailableSlot } from "@/components/SlotGrid";

function todayIso(): string {
  // Local date, not UTC - new Date().toISOString() would put a guest west
  // of UTC into "tomorrow" every evening and block booking tonight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDetails(details: Record<string, string> | undefined): string {
  if (!details) return "Please check your details and try again.";
  return Object.entries(details)
    .map(([field, message]) => `${field.replace("_", " ")}: ${message}`)
    .join(" ");
}

function AuthGate() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="font-display text-2xl text-ink text-balance">Check your inbox</p>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to <span className="text-ink">{email}</span>. Open it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-8">
      <p className="font-display text-2xl text-ink text-balance">Sign in to reserve</p>
      <p className="mt-2 text-sm text-muted">
        We&apos;ll email you a one-time link — no password needed for guests.
      </p>
      <label className="mt-6 flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="jane@example.com"
        />
      </label>
      {error && <p className="mt-3 text-sm text-status-cancelled">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-claret px-5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}

function BookingFlow() {
  const [date, setDate] = useState(todayIso());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ name: string; date: string; time: string } | null>(null);

  const requestIdRef = useRef(0);

  const loadSlots = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoadingSlots(true);
    setSlotsError(null);
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&party_size=${partySize}`);
      if (requestId !== requestIdRef.current) return; // a newer request superseded this one
      const body = await res.json();
      if (!res.ok) {
        setSlots([]);
        setSlotsError(body.error ?? "Couldn't load available times.");
        return;
      }
      setSlots(body);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setSlots([]);
      setSlotsError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (requestId === requestIdRef.current) setLoadingSlots(false);
    }
  }, [date, partySize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/dep-change, the canonical Effects use case
    loadSlots();
  }, [loadSlots]);

  async function handleBook(fields: { name: string; phone: string; email: string }) {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          slot_id: selectedSlot.slot_id,
          guest_name: fields.name,
          guest_phone: fields.phone || null,
          guest_email: fields.email || null,
          party_size: partySize,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(
          body.error === "validation_failed" ? formatDetails(body.details) : (body.error ?? "Something went wrong - please try another time.")
        );
        return;
      }
      setConfirmed({ name: fields.name, date, time: selectedSlot.start_time });
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-xs uppercase tracking-[0.14em] text-status-confirmed">Request sent</p>
        <p className="mt-2 font-display text-3xl text-ink text-balance">Thank you, {confirmed.name}.</p>
        <p className="mt-2 text-sm text-muted">
          Your table for {confirmed.date} at {confirmed.time.slice(0, 5)} is pending confirmation. We&apos;ll be
          in touch shortly.
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(null)}
          className="mt-5 text-sm text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
        >
          Book another table
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">
            <span className="font-mono text-xs text-muted">01</span> Date
          </span>
          <input
            type="date"
            value={date}
            min={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">
            <span className="font-mono text-xs text-muted">02</span> Party size
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={partySize}
            onChange={(e) => setPartySize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          />
        </label>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-ink">
          <span className="font-mono text-xs text-muted">03</span> Available times
        </p>
        {loadingSlots || slots === null ? (
          <SlotGridSkeleton />
        ) : slotsError ? (
          <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-3 text-sm text-status-cancelled">
            {slotsError}
          </p>
        ) : (
          <SlotGrid slots={slots} selectedSlotId={selectedSlot?.slot_id ?? null} onSelect={setSelectedSlot} />
        )}
      </div>

      {selectedSlot && (
        <BookingForm
          slot={selectedSlot}
          submitting={submitting}
          error={submitError}
          onSubmit={handleBook}
          onChangeSlot={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

export default function GuestPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12 sm:py-16">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow</p>
        <h1 className="mt-2 text-balance font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Reserve your table
        </h1>
        <p className="mt-3 text-pretty text-muted">
          Pick a date, tell us how many, and we&apos;ll hold the table.
        </p>
      </header>

      {session === undefined ? (
        <div className="skeleton h-[220px] rounded-2xl border border-line" />
      ) : session === null ? (
        <AuthGate />
      ) : (
        <BookingFlow />
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { apiFetch, parseError } from "@/lib/api";
import { formatDateTime, guestsLabel } from "@/lib/ru";
import { restaurantTodayIso } from "@/lib/scheduling";
import { StatusPill } from "@/components/StatusPill";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BackgroundBlobs } from "@/components/guest/BackgroundBlobs";
import type { ReservationStatus } from "@/lib/reservations";

type MyReservation = {
  id: number;
  date: string;
  start_time: string;
  party_size: number;
  status: ReservationStatus;
  reservation_tables: { dining_tables: { label: string; halls: { name: string } } }[];
};

function ReservationRow({
  reservation,
  canCancel,
  onCancel,
}: {
  reservation: MyReservation;
  canCancel: boolean;
  onCancel: (r: MyReservation) => void;
}) {
  const place = reservation.reservation_tables
    .map((rt) => `${rt.dining_tables.halls.name} · ${rt.dining_tables.label}`)
    .join(", ");
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-[140px]">
        <p className="font-mono text-sm font-medium tabular-nums capitalize text-ink">
          {formatDateTime(reservation.date, reservation.start_time)}
        </p>
        <p className="text-xs text-muted">
          {place || "—"} · {guestsLabel(reservation.party_size)}
        </p>
      </div>
      <StatusPill status={reservation.status} />
      {canCancel && (
        <button
          type="button"
          onClick={() => onCancel(reservation)}
          className="ml-auto text-sm text-status-cancelled underline decoration-status-cancelled/40 underline-offset-4 hover:brightness-90"
        >
          Отменить
        </button>
      )}
    </div>
  );
}

function AccountContent({ session }: { session: Session }) {
  const [reservations, setReservations] = useState<MyReservation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<MyReservation | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const supabase = createBrowserSupabaseClient();
    // RLS already scopes this to the signed-in guest's own rows - no API
    // route needed just to read them back.
    const { data, error } = await supabase
      .from("reservations")
      .select("id, date, start_time, party_size, status, reservation_tables(dining_tables(label, halls(name)))")
      .eq("guest_user_id", session.user.id)
      .order("date", { ascending: false })
      .order("start_time", { ascending: false });
    if (error) {
      setLoadError("Не удалось загрузить брони. Попробуйте обновить страницу.");
      setReservations([]);
      return;
    }
    setReservations((data as unknown as MyReservation[]) ?? []);
  }, [session.user.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the canonical Effects use case
    load();
  }, [load]);

  async function handleCancel() {
    if (!cancelling) return;
    const res = await apiFetch(`/api/reservations/${cancelling.id}/cancel`, { method: "POST" });
    if (!res.ok) {
      throw new Error(await parseError(res));
    }
    load();
  }

  if (reservations === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl border border-line" />
        ))}
      </div>
    );
  }
  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}
      </p>
    );
  }

  const today = restaurantTodayIso();
  const upcoming = reservations
    .filter((r) => r.date >= today && r.status !== "cancelled" && r.status !== "no-show" && r.status !== "completed")
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcomingIds = new Set(upcoming.map((r) => r.id));
  const history = reservations.filter((r) => !upcomingIds.has(r.id));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 font-display text-xl text-ink">Предстоящие</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Нет предстоящих броней.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((r) => (
              <ReservationRow key={r.id} reservation={r} canCancel onCancel={setCancelling} />
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-xl text-ink">История</h2>
          <div className="flex flex-col gap-2 opacity-80">
            {history.map((r) => (
              <ReservationRow key={r.id} reservation={r} canCancel={false} onCancel={setCancelling} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={handleCancel}
        title="Отмена брони"
        message="Отменить эту бронь? Это действие нельзя отменить."
        confirmLabel="Отменить бронь"
        danger
      />
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/account/login");
        return;
      }
      setSession(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/account/login");
        return;
      }
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12 sm:py-16">
      <BackgroundBlobs />
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow</p>
        <h1 className="mt-2 text-balance font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Мои брони
        </h1>
        <Link
          href="/"
          className="mt-3 inline-block text-sm text-claret underline decoration-claret/40 underline-offset-4 hover:text-claret-strong"
        >
          ← Забронировать ещё
        </Link>
      </header>

      {session === undefined ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl border border-line" />
          ))}
        </div>
      ) : session === null ? null : (
        <AccountContent session={session} />
      )}
    </main>
  );
}

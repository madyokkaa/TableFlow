"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { apiFetch, parseError } from "@/lib/api";
import { formatDateTime, guestsLabel } from "@/lib/ru";
import { restaurantTodayIso } from "@/lib/scheduling";
import { STATUS_LABELS_RU, type ReservationStatus } from "@/lib/reservations";
import { BookingTicket, type TicketReservation } from "@/components/guest/BookingTicket";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";

type MyReservation = {
  id: number;
  date: string;
  start_time: string;
  party_size: number;
  status: ReservationStatus;
  cancellation_reason: string | null;
  cancelled_by: "guest" | "host" | null;
  reservation_tables: { table_id: number; dining_tables: { label: string; hall_id: number; halls: { name: string } | null } | null }[];
};

const TAB_WIDTH = 150;

function toTicket(r: MyReservation): TicketReservation {
  const tables = r.reservation_tables.map((rt) => rt.dining_tables).filter((t): t is NonNullable<typeof t> => !!t);
  return {
    id: r.id,
    date: r.date,
    start_time: r.start_time,
    party_size: r.party_size,
    status: r.status,
    hallName: tables[0]?.halls?.name ?? "",
    tableLabels: tables.map((t) => t.label),
    tableIds: r.reservation_tables.map((rt) => rt.table_id),
    hallId: tables[0]?.hall_id ?? null,
  };
}

function EmptyTable() {
  return (
    <div className="relative h-[120px] w-[120px]" aria-hidden="true">
      {[0, 90, 180, 270].map((angle, i) => (
        <span
          key={angle}
          className="absolute left-[49px] top-[53px] h-3.5 w-[22px] animate-[gp-chair_3.4s_cubic-bezier(.4,0,.2,1)_infinite] rounded-[7px_7px_4px_4px] border-[1.5px] border-[#4a3833] bg-[#1a1311]"
          style={{ "--a": `${angle}deg`, transform: `rotate(${angle}deg) translateY(-38px)`, animationDelay: `${i * 0.15}s` } as React.CSSProperties}
        />
      ))}
      <span className="absolute left-[30px] top-[30px] h-[60px] w-[60px] rounded-full border-[1.5px] border-[#4a3833] bg-surface-raised" />
    </div>
  );
}

function HistoryItem({ reservation, index }: { reservation: MyReservation; index: number }) {
  const ticket = toTicket(reservation);
  // The host's own reason for rejecting a booking is internal - a guest only
  // ever sees that the restaurant cancelled it, never why.
  const note =
    reservation.status === "cancelled"
      ? reservation.cancelled_by === "host"
        ? "Отменено рестораном"
        : reservation.cancellation_reason
          ? `Вы: ${reservation.cancellation_reason.charAt(0).toLowerCase()}${reservation.cancellation_reason.slice(1)}`
          : null
      : null;
  const done = reservation.status === "completed";
  const pill =
    reservation.status === "cancelled"
      ? "bg-status-cancelled-tint text-status-cancelled"
      : done
        ? "bg-status-confirmed-tint text-status-confirmed"
        : "bg-status-noshow-tint text-status-noshow";
  const label = done ? "Состоялась" : (STATUS_LABELS_RU[reservation.status] ?? reservation.status);
  return (
    <li
      className={`relative grid animate-[gp-slide-in_.55s_cubic-bezier(.2,.9,.3,1.15)_both] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-line bg-surface px-[18px] py-4 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] hover:translate-x-1 hover:border-[#4a3833] before:absolute before:-left-[26px] before:top-1/2 before:-mt-1.5 before:h-3 before:w-3 before:rounded-full before:border-2 before:bg-paper ${
        reservation.status === "cancelled"
          ? "before:border-status-cancelled"
          : done
            ? "before:border-status-confirmed"
            : "before:border-status-noshow"
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="min-w-0">
        <div className="font-mono text-sm font-medium capitalize">{formatDateTime(reservation.date, reservation.start_time)}</div>
        <div className="mt-[3px] text-xs text-muted">
          {ticket.hallName || "Зал"} · {ticket.tableLabels.length > 1 ? "столы" : "стол"} {ticket.tableLabels.join(", ") || "—"} ·{" "}
          {guestsLabel(reservation.party_size)}
        </div>
        {note && <div className="mt-1 text-xs text-status-cancelled">{note}</div>}
      </div>
      <span className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${pill}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {label}
      </span>
    </li>
  );
}

function AccountContent({ session }: { session: Session }) {
  const [reservations, setReservations] = useState<MyReservation[] | null>(null);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");

  const load = useCallback(async () => {
    setLoadError(null);
    const supabase = createBrowserSupabaseClient();
    // RLS already scopes this to the signed-in guest's own rows - no API
    // route needed just to read them back.
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, date, start_time, party_size, status, cancellation_reason, cancelled_by, reservation_tables(table_id, dining_tables(label, hall_id, halls(name)))"
      )
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
    // The floor plan behind each ticket's mini map is public data; if it
    // fails the tickets just render without a map.
    Promise.all([fetch("/api/halls"), fetch("/api/tables")])
      .then(async ([hallsRes, tablesRes]) => {
        if (hallsRes.ok) setHalls(await hallsRes.json());
        if (tablesRes.ok) setTables(await tablesRes.json());
      })
      .catch(() => {});
  }, [load]);

  async function cancel(id: number, reason: string | null) {
    const res = await apiFetch(`/api/reservations/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
    if (!res.ok) throw new Error(await parseError(res));
    await load();
  }

  if (reservations === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-[50px] w-[308px] rounded-[14px]" />
        <div className="skeleton h-[280px] rounded-[26px]" />
      </div>
    );
  }
  if (loadError) {
    return (
      <p className="rounded-xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {loadError}{" "}
        <button type="button" onClick={load} className="underline underline-offset-4">
          Повторить
        </button>
      </p>
    );
  }

  const today = restaurantTodayIso();
  const upcoming = reservations
    .filter((r) => r.date >= today && (r.status === "pending" || r.status === "confirmed"))
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcomingIds = new Set(upcoming.map((r) => r.id));
  const history = reservations.filter((r) => !upcomingIds.has(r.id));

  return (
    <div className="flex flex-col gap-[30px]">
      <div role="tablist" aria-label="Брони" className="relative inline-flex self-start rounded-[14px] border border-line-strong bg-[#1a1311] p-1">
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 h-[42px] rounded-[10px] bg-claret transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
          style={{ width: TAB_WIDTH, transform: `translateX(${tab === "upcoming" ? 0 : TAB_WIDTH}px)` }}
        />
        {(
          [
            ["upcoming", "Предстоящие", upcoming.length],
            ["history", "История", history.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            style={{ width: TAB_WIDTH }}
            className={`relative z-[1] flex h-[42px] items-center justify-center gap-2 text-sm font-semibold transition-colors duration-300 ${
              tab === value ? "text-on-accent" : "text-muted hover:text-ink"
            }`}
          >
            {label}
            <b className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/20 px-[5px] font-mono text-[11px]">{count}</b>
          </button>
        ))}
      </div>

      {tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <div className="flex animate-[gp-up_.6s_both] flex-col items-center gap-4 rounded-[26px] border border-dashed border-line-strong px-6 py-10 text-center">
            <EmptyTable />
            <div className="font-display text-2xl">Стол пока свободен</div>
            <p className="max-w-[320px] text-sm text-muted">Предстоящих броней нет. Выберите стол на схеме — займёт меньше минуты.</p>
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-claret px-[18px] text-sm font-bold text-on-accent transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_var(--color-claret)]"
            >
              Забронировать столик
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {upcoming.map((r) => {
              const ticket = toTicket(r);
              return (
                <BookingTicket
                  key={r.id}
                  reservation={ticket}
                  hall={halls.find((h) => h.id === ticket.hallId) ?? null}
                  hallTables={tables.filter((t) => t.hall_id === ticket.hallId)}
                  onCancel={(reason) => cancel(r.id, reason)}
                />
              );
            })}
          </div>
        )
      ) : history.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          Здесь появятся прошедшие и отменённые брони.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-3 pl-7 before:absolute before:bottom-2.5 before:left-2 before:top-2.5 before:w-0.5 before:origin-top before:animate-[gp-line_1s_cubic-bezier(.6,0,.2,1)_both] before:rounded-sm before:bg-line">
          {history.map((r, i) => (
            <HistoryItem key={r.id} reservation={r} index={i} />
          ))}
        </ol>
      )}
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
    <div className="relative flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute -left-[220px] -top-[120px] h-[640px] w-[640px] animate-[gp-drift_18s_ease-in-out_infinite_alternate] rounded-full bg-[radial-gradient(circle,rgb(236_143_163/0.08),rgb(236_143_163/0)_65%)]"
        aria-hidden="true"
      />
      <main className="relative mx-auto flex w-full max-w-[760px] flex-col gap-[30px] px-6 pb-[72px] pt-7">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-[0.28em] text-[#c9b6ae]">TABLEFLOW</span>
          <Link href="/" className="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-claret hover:text-claret-strong">
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={2} aria-hidden="true" />
            Забронировать ещё
          </Link>
        </div>
        <h1 className="animate-[gp-up_.7s_both] font-display text-[clamp(40px,6vw,58px)] font-normal leading-none tracking-[-0.02em]">
          Мои <em className="not-italic text-claret">брони</em>
        </h1>

        {session === undefined ? (
          <div className="skeleton h-[280px] rounded-[26px]" />
        ) : session === null ? null : (
          <AccountContent session={session} />
        )}
      </main>
    </div>
  );
}

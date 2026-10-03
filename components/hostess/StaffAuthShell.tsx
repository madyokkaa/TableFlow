"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { hallPlanSize } from "@/lib/floorPlan";
import { tableSize } from "@/lib/tableShapes";
import { pluralize } from "@/lib/ru";
import { planUnits } from "@/components/floor-plan/PlanShapes";
import type { Hall } from "./HallForm";
import type { DiningTable } from "./TableForm";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now ? now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

/** Left half of the staff auth card: the first hall's real plan with a scan
 * line sweeping it while the shift is closed (each table lights up as the
 * line passes), turning green when the shift opens, plus a few live facts.
 * Reads the same public GET endpoints as the guest booking page. */
function PlanScanner({ open }: { open: boolean }) {
  const clock = useClock();
  const [halls, setHalls] = useState<Hall[] | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/halls"), fetch("/api/tables")])
      .then(async ([h, t]) => {
        if (!h.ok || !t.ok) throw new Error("plan unavailable");
        const [hallRows, tableRows] = (await Promise.all([h.json(), t.json()])) as [Hall[], DiningTable[]];
        if (!cancelled) {
          setHalls(hallRows);
          setTables(tableRows.filter((row) => row.is_active));
        }
      })
      .catch(() => {
        // Decorative only - leave the plan empty and the counts as dashes.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hall = halls?.[0] ?? null;
  const room = hallPlanSize(hall ?? {});
  const unit = planUnits(room.w);
  const shown = hall ? tables.filter((t) => t.hall_id === hall.id) : [];

  return (
    <div
      className={`flex flex-col justify-between gap-[22px] border-b border-[#2c2220] bg-paper p-5 sm:p-8 md:border-b-0 md:border-r ${open ? "sl-ok" : ""}`}
    >
      <span className="inline-flex h-[30px] items-center gap-2 self-start rounded-full border border-line-strong px-3 font-mono text-[10.5px] tracking-[0.14em] text-[#c9b6ae]" role="status">
        <i
          className={`h-[7px] w-[7px] rounded-full ${open ? "bg-status-confirmed" : "animate-[sl-blink_1.4s_infinite] bg-status-pending"}`}
          aria-hidden="true"
        />
        {open ? "СМЕНА ОТКРЫТА" : "ЗАЛ ЖДЁТ СМЕНУ"}
      </span>
      <p className="font-display text-2xl leading-[1.2] text-[#e6d8d2]">
        Зал, брони и столы — <em className="text-claret">в одном окне</em> на всю смену.
      </p>
      <div
        className="relative overflow-hidden rounded-[18px] border border-[#2c2220] bg-[#181210] [container-type:inline-size]"
        style={{
          aspectRatio: `${room.w} / ${room.h}`,
          backgroundImage: "linear-gradient(#211816 1px, transparent 1px), linear-gradient(90deg, #211816 1px, transparent 1px)",
          backgroundSize: `${(40 / room.w) * 100}% ${(40 / room.h) * 100}%`,
        }}
        aria-hidden="true"
      >
        {!open && <span className="sl-scan" />}
        {shown.map((t, i) => {
          const size = tableSize(t.shape, t.max_capacity);
          return (
            <span
              key={t.id}
              className="sl-table"
              style={{
                left: `${(t.pos_x / room.w) * 100}%`,
                top: `${(t.pos_y / room.h) * 100}%`,
                width: unit(size.w),
                height: unit(size.h),
                borderRadius: t.shape === "round" ? "50%" : "1.2cqw",
                transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg)`,
                animationDelay: open ? `${i * 60}ms` : `${((t.pos_x / room.w) * 4 - 0.2).toFixed(2)}s`,
              }}
            >
              <span style={{ transform: `rotate(${-(t.rotation ?? 0)}deg)` }}>{t.label}</span>
            </span>
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-2.5">
        {[
          [halls ? String(halls.length) : "—", halls ? pluralize(halls.length, "зал", "зала", "залов") : "залы"],
          [halls ? String(tables.length) : "—", halls ? pluralize(tables.length, "стол", "стола", "столов") : "столы"],
          [clock, "сейчас"],
        ].map(([value, label], i) => (
          <div
            key={i}
            className="flex animate-[gp-up_.6s_both] flex-col-reverse gap-0.5 rounded-[14px] border border-[#2c2220] p-3"
            style={{ animationDelay: `${200 + i * 80}ms` }}
          >
            <dt className="text-[11px] text-[#a8958e]">{label}</dt>
            <dd className="font-display text-[26px] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shell for the staff auth screens: a grid-paper page, the plan scanner on
 * the left and the form column on the right. `shake` re-triggers a
 * horizontal shake of the whole card each time it changes (failed login). */
export function StaffAuthShell({
  title,
  subtitle,
  open = false,
  shake = 0,
  overlay,
  children,
}: {
  title: string;
  subtitle: string;
  open?: boolean;
  shake?: number;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className="flex min-h-svh w-full flex-1 items-center justify-center overflow-hidden px-4 py-8"
      style={{
        backgroundColor: "#120d0c",
        backgroundImage: "linear-gradient(#1a1412 1px, transparent 1px), linear-gradient(90deg, #1a1412 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div key={shake} className={shake ? "w-full max-w-[1000px] animate-[sl-shake_.5s]" : "w-full max-w-[1000px]"}>
        <div className="grid w-full animate-[gp-up_.7s_cubic-bezier(.2,.8,.2,1)_both] overflow-hidden rounded-[30px] border border-line bg-[#1a1311] shadow-[0_50px_100px_-50px_#000] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <PlanScanner open={open} />
          <div className="relative flex flex-col gap-[18px] px-5 py-7 sm:px-10 sm:pb-9 sm:pt-11">
            <span className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.28em] text-[#c9b6ae]">
              TABLEFLOW
              <span className="h-[5px] w-[5px] rounded-full bg-claret" aria-hidden="true" />
              ПЕРСОНАЛ
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[38px] font-normal leading-[1.05] tracking-[-0.02em] text-balance">{title}</h1>
              <p className="text-sm leading-normal text-muted">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-surface-raised px-3.5 py-3 text-[12.5px] text-[#c9b6ae]">
              <Lock className="h-[18px] w-[18px] shrink-0 text-status-pending" strokeWidth={2} aria-hidden="true" />
              Учётные записи создаются только по приглашению администратора.
            </div>
            {children}
            {overlay}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Covers the staff form column: a drawn check mark (or nothing), a heading,
 * text and actions - left-aligned, as in the prototype. */
export function StaffOverlay({
  check = false,
  title,
  children,
}: {
  check?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div role={check ? "status" : "dialog"} aria-label={title} className="absolute inset-0 z-10 flex animate-[fp-fadein_.35s_both] flex-col justify-center gap-4 bg-[#1a1311] p-6 sm:p-10">
      {check && (
        <svg className="ga-check h-16 w-16" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <circle cx="36" cy="36" r="32" stroke="var(--color-status-confirmed)" strokeWidth="3" />
          <path d="M23 37l9 9 17-19" stroke="var(--color-status-confirmed)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <div className="font-display text-[32px] leading-[1.1]">{title}</div>
      {children}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/hostess/AdminShell";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { StaggerGrid } from "@/components/hostess/dashboard/StaggerGrid";
import { LoadBar, Sparkline, StatCard } from "@/components/hostess/dashboard/StatCard";
import { CARD_LINK, DashboardCard } from "@/components/hostess/dashboard/DashboardCard";
import { PeriodSelector } from "@/components/hostess/dashboard/PeriodSelector";
import { ReservationsTrendChart, TrendLegend } from "@/components/hostess/dashboard/ReservationsTrendChart";
import { HourlyBarChart } from "@/components/hostess/dashboard/HourlyBarChart";
import { UpcomingList } from "@/components/hostess/dashboard/UpcomingList";
import { LiveHallCard } from "@/components/hostess/dashboard/LiveHallCard";
import { GuestOriginSplit } from "@/components/hostess/dashboard/GuestOriginSplit";
import { formatRuNumber } from "@/lib/ru";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-36 rounded-[22px] border border-line" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="skeleton h-80 rounded-[22px] border border-line" />
        <div className="skeleton h-80 rounded-[22px] border border-line" />
      </div>
    </div>
  );
}

function DashboardContent() {
  const [period, setPeriod] = useState<7 | 30>(7);
  const { stats, loading, error, reload } = useDashboardStats(period);

  if (loading && !stats) return <DashboardSkeleton />;

  if (error) {
    return (
      <p role="alert" className="rounded-[22px] border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {error}{" "}
        <button type="button" onClick={reload} className="min-h-11 underline underline-offset-4">
          Повторить
        </button>
      </p>
    );
  }

  if (!stats) return null;

  const occupancyPercent = stats.occupancy.totalActive
    ? Math.round((stats.occupancy.occupied / stats.occupancy.totalActive) * 100)
    : 0;
  const noShowDelta = stats.weekly.noShowRate - stats.weekly.noShowRatePrev;
  const partySizeDelta = Math.round((stats.weekly.avgPartySize - stats.weekly.avgPartySizePrev) * 10) / 10;
  const recentTotals = stats.trend
    .slice(-6)
    .map((d) => d.pending + d.confirmed + d.completed + d.cancelled + d["no-show"]);

  return (
    <div className="flex flex-col gap-4">
      <StaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Брони сегодня"
          value={String(stats.today.total)}
          sublabel={`${stats.today.byStatus.confirmed} подтверждено · ${stats.today.byStatus.pending} ожидает`}
          href="/hostess"
          ariaLabel={`Брони сегодня: ${stats.today.total}. Открыть список броней`}
        >
          <Sparkline values={recentTotals} />
        </StatCard>
        <StatCard
          label="Загрузка столов сейчас"
          value={String(occupancyPercent)}
          unit="%"
          sublabel={`${stats.occupancy.occupied} из ${stats.occupancy.totalActive} столов`}
          href="/hostess/halls"
          ariaLabel={`Загрузка столов: ${occupancyPercent}%. Открыть залы`}
        >
          <LoadBar percent={occupancyPercent} />
        </StatCard>
        <StatCard
          label="No-show за 7 дней"
          value={String(stats.weekly.noShowRate)}
          unit="%"
          trend={
            noShowDelta === 0
              ? undefined
              : {
                  label: `${noShowDelta > 0 ? "+" : "−"}${Math.abs(noShowDelta)} п.п. к прошлой неделе`,
                  direction: noShowDelta > 0 ? "up" : "down",
                  tone: noShowDelta > 0 ? "negative" : "positive",
                }
          }
        />
        <StatCard
          label="Средний размер группы"
          value={formatRuNumber(stats.weekly.avgPartySize)}
          unit="чел."
          trend={
            partySizeDelta === 0
              ? undefined
              : {
                  label: `${partySizeDelta > 0 ? "+" : "−"}${formatRuNumber(Math.abs(partySizeDelta))} к прошлой неделе`,
                  direction: partySizeDelta > 0 ? "up" : "down",
                  tone: "neutral",
                }
          }
        />
      </StaggerGrid>

      <StaggerGrid className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardCard title={`Динамика броней · ${period} дней`} action={<PeriodSelector value={period} onChange={setPeriod} />}>
          <TrendLegend />
          <ReservationsTrendChart data={stats.trend} />
        </DashboardCard>
        <DashboardCard
          title="Ближайшие брони"
          action={
            <Link href="/hostess" className={CARD_LINK}>
              Все →
            </Link>
          }
        >
          <UpcomingList items={stats.upcoming} />
        </DashboardCard>

        <DashboardCard title="Брони по часам" action={<span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">за {period} дней</span>}>
          <HourlyBarChart data={stats.hourly} />
        </DashboardCard>
        <LiveHallCard stats={stats} />
      </StaggerGrid>

      <StaggerGrid className="grid grid-cols-1">
        <DashboardCard>
          <GuestOriginSplit origin={stats.guestOrigin} period={period} />
        </DashboardCard>
      </StaggerGrid>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  );
}

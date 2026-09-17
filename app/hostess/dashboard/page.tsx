"use client";

import { useState } from "react";
import { AdminShell } from "@/components/hostess/AdminShell";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { DashboardBackground } from "@/components/hostess/dashboard/DashboardBackground";
import { StaggerGrid } from "@/components/hostess/dashboard/StaggerGrid";
import { StatCard } from "@/components/hostess/dashboard/StatCard";
import { DashboardCard } from "@/components/hostess/dashboard/DashboardCard";
import { PeriodSelector } from "@/components/hostess/dashboard/PeriodSelector";
import { ReservationsTrendChart } from "@/components/hostess/dashboard/ReservationsTrendChart";
import { HourlyBarChart } from "@/components/hostess/dashboard/HourlyBarChart";
import { UpcomingList } from "@/components/hostess/dashboard/UpcomingList";
import { HallOccupancyList } from "@/components/hostess/dashboard/HallOccupancyList";
import { TableStatusChips } from "@/components/hostess/dashboard/TableStatusChips";
import { GuestOriginSplit } from "@/components/hostess/dashboard/GuestOriginSplit";
import { formatRuNumber } from "@/lib/ru";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl border border-line" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="skeleton h-72 rounded-2xl border border-line lg:col-span-2" />
        <div className="skeleton h-72 rounded-2xl border border-line" />
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
      <p className="rounded-2xl border border-status-cancelled/40 bg-status-cancelled-tint px-4 py-8 text-center text-sm text-status-cancelled">
        {error}{" "}
        <button type="button" onClick={reload} className="underline underline-offset-4">
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

  return (
    <div className="relative flex flex-col gap-6">
      <DashboardBackground />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Брони сегодня"
          value={String(stats.today.total)}
          sublabel={`${stats.today.byStatus.confirmed} подтверждено · ${stats.today.byStatus.pending} ожидает`}
        />
        <StatCard
          label="Загрузка столов сейчас"
          value={`${occupancyPercent}%`}
          sublabel={`${stats.occupancy.occupied} из ${stats.occupancy.totalActive} столов`}
        />
        <StatCard
          label="No-show за 7 дней"
          value={`${stats.weekly.noShowRate}%`}
          trend={
            noShowDelta === 0
              ? undefined
              : {
                  label: `${Math.abs(noShowDelta)} п.п. к прошлой неделе`,
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
                  label: `${formatRuNumber(Math.abs(partySizeDelta))} к прошлой неделе`,
                  direction: partySizeDelta > 0 ? "up" : "down",
                  tone: "neutral",
                }
          }
        />
      </StaggerGrid>

      <StaggerGrid className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardCard
          title="Динамика броней"
          action={<PeriodSelector value={period} onChange={setPeriod} />}
          className="lg:col-span-2"
        >
          <ReservationsTrendChart data={stats.trend} />
        </DashboardCard>
        <DashboardCard title="Ближайшие брони">
          <UpcomingList items={stats.upcoming} />
        </DashboardCard>

        <DashboardCard title="Брони по часам" className="lg:col-span-2">
          <HourlyBarChart data={stats.hourly} />
        </DashboardCard>
        <DashboardCard title="Залы сейчас">
          <div className="flex flex-col gap-5">
            <TableStatusChips occupancy={stats.occupancy} />
            <HallOccupancyList halls={stats.halls} />
          </div>
        </DashboardCard>
      </StaggerGrid>

      <StaggerGrid className="grid grid-cols-1">
        <DashboardCard title="С аккаунтом vs анонимные">
          <GuestOriginSplit origin={stats.guestOrigin} />
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

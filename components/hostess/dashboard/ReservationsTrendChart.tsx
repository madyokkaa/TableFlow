"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateShort } from "@/lib/ru";
import { restaurantTodayIso } from "@/lib/scheduling";
import type { DashboardStats } from "@/lib/dashboard/types";

// "completed" folds into "confirmed" here - both are the successful-visit
// path, and keeping them as one series avoids a 5th, mostly-empty stack band.
// Order is bottom-to-top of each stacked column.
const SERIES = [
  { key: "confirmedTotal", label: "Подтверждено", color: "var(--color-status-confirmed)" },
  { key: "pending", label: "Ожидает", color: "var(--color-status-pending)" },
  { key: "cancelled", label: "Отменено", color: "var(--color-status-cancelled)" },
  { key: "no-show", label: "Не пришли", color: "#7d6a64" },
] as const;

type ChartPoint = { date: string; confirmedTotal: number } & Record<string, number | string>;

type TooltipPayloadEntry = { dataKey: string; value: number; color: string };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  return (
    <div className="rounded-[10px] bg-ink px-3 py-2 text-xs font-semibold text-surface shadow-[0_18px_40px_-18px_#000]">
      <p className="mb-1">
        {formatDateShort(label)} · {total}
      </p>
      <div className="flex flex-col gap-0.5 font-medium">
        {[...payload].reverse().map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: entry.color }} />
            <span>{SERIES.find((s) => s.key === entry.dataKey)?.label}</span>
            <span className="ml-auto pl-3 font-bold">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {[SERIES[1], SERIES[0], SERIES[2], SERIES[3]].map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <i className="block h-[9px] w-[9px] rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function DayTick({ x, y, payload, today }: { x?: number; y?: number; payload?: { value: string }; today: string }) {
  if (x === undefined || y === undefined || !payload) return null;
  const [, month, day] = payload.value.split("-");
  const isToday = payload.value === today;
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontFamily="var(--font-mono)"
      fontSize={10.5}
      fill={isToday ? "var(--color-claret)" : "#8f7c75"}
      fontWeight={isToday ? 700 : 400}
    >
      {isToday ? "сегодня" : `${day}.${month}`}
    </text>
  );
}

/** Stacked columns per day: confirmed at the bottom, then pending,
 * cancelled and no-shows, with today's label picked out in claret. */
export function ReservationsTrendChart({ data }: { data: DashboardStats["trend"] }) {
  const today = restaurantTodayIso();
  const chartData: ChartPoint[] = data.map((point) => ({
    ...point,
    confirmedTotal: point.confirmed + point.completed,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#251c1a" />
        <YAxis hide allowDecimals={false} />
        <XAxis
          dataKey="date"
          tick={<DayTick today={today} />}
          axisLine={{ stroke: "#2c2220" }}
          tickLine={false}
          interval={chartData.length <= 10 ? 0 : "preserveStartEnd"}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(236 143 163 / 0.06)" }} />
        {SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="reservations"
            fill={s.color}
            stroke="var(--color-surface)"
            strokeWidth={2}
            radius={[5, 5, 5, 5]}
            maxBarSize={46}
            animationDuration={900}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

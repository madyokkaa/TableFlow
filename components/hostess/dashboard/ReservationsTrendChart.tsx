"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatDateShort } from "@/lib/ru";
import type { DashboardStats } from "@/lib/dashboard/types";

// "completed" folds into "confirmed" here - both are the successful-visit
// path, and keeping them as one series avoids a 5th, mostly-empty stack band.
const SERIES = [
  { key: "pending", label: "Ожидает", color: "var(--color-status-pending)" },
  { key: "confirmedTotal", label: "Подтверждено", color: "var(--color-status-confirmed)" },
  { key: "cancelled", label: "Отменено", color: "var(--color-status-cancelled)" },
  { key: "no-show", label: "Не пришли", color: "var(--color-status-noshow)" },
] as const;

type ChartPoint = { date: string; confirmedTotal: number } & Record<string, number | string>;

type TooltipPayloadEntry = { dataKey: string; value: number; color: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-floating)]">
      <p className="mb-1.5 font-medium text-ink">{formatDateShort(label)}</p>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span>{SERIES.find((s) => s.key === entry.dataKey)?.label}</span>
            <span className="ml-auto font-medium text-ink">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReservationsTrendChart({ data }: { data: DashboardStats["trend"] }) {
  const chartData: ChartPoint[] = data.map((point) => ({
    ...point,
    confirmedTotal: point.confirmed + point.completed,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`dashboard-trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(iso: string) => {
              const [, month, day] = iso.split("-");
              return `${day}.${month}`;
            }}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }} />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="linear"
              dataKey={s.key}
              stackId="reservations"
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#dashboard-trend-fill-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

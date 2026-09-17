"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { pluralize } from "@/lib/ru";
import type { DashboardStats } from "@/lib/dashboard/types";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length || label === undefined) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-floating)]">
      <p className="font-medium text-ink">{label}:00</p>
      <p className="text-muted">
        {value} {pluralize(value, "бронь", "брони", "броней")}
      </p>
    </div>
  );
}

export function HourlyBarChart({ data }: { data: DashboardStats["hourly"] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="hour"
          tickFormatter={(hour: number) => `${hour}`}
          tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-claret-tint)" }} />
        <Bar dataKey="count" fill="var(--color-claret)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

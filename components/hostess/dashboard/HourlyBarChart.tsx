"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { pluralize } from "@/lib/ru";
import { restaurantNowMinutes } from "@/lib/scheduling";
import type { DashboardStats } from "@/lib/dashboard/types";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length || label === undefined) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-[10px] bg-ink px-3 py-2 text-xs font-semibold text-surface shadow-[0_18px_40px_-18px_#000]">
      {label}:00 · {value} {pluralize(value, "бронь", "брони", "броней")}
    </div>
  );
}

function HourTick({ x, y, payload, nowHour }: { x?: number; y?: number; payload?: { value: number }; nowHour: number }) {
  if (x === undefined || y === undefined || !payload) return null;
  const isNow = payload.value === nowHour;
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10.5} fill={isNow ? "var(--color-claret)" : "#8f7c75"}>
      {isNow ? "сейчас" : payload.value}
    </text>
  );
}

/** Reservations per starting hour; the current hour's column is claret and
 * labelled «сейчас», the rest a muted wine that lights up on hover. Fills
 * the card's height so it lines up with the taller hall card beside it. */
export function HourlyBarChart({ data }: { data: DashboardStats["hourly"] }) {
  const nowHour = Math.floor(restaurantNowMinutes() / 60);
  return (
    <div className="min-h-[200px] flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
          <XAxis dataKey="hour" tick={<HourTick nowHour={nowHour} />} axisLine={{ stroke: "#2c2220" }} tickLine={false} interval={0} />
          <Tooltip content={<ChartTooltip />} cursor={false} />
          <Bar dataKey="count" radius={[7, 7, 3, 3]} maxBarSize={30} animationDuration={900} activeBar={{ fill: "var(--color-claret)" }}>
            {data.map((point) => (
              <Cell key={point.hour} fill={point.hour === nowHour ? "var(--color-claret)" : "#4a2f37"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

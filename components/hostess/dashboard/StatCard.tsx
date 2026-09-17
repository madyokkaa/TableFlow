"use client";

import { motion } from "motion/react";
import { TrendingDown as TrendDownIcon, TrendingUp as TrendUpIcon } from "lucide-react";
import { CARD_VARIANTS } from "./motionVariants";

type Trend = { label: string; direction: "up" | "down"; tone: "positive" | "negative" | "neutral" };

const TONE_CLASSES: Record<Trend["tone"], string> = {
  positive: "text-status-confirmed",
  negative: "text-status-cancelled",
  neutral: "text-muted",
};

export function StatCard({
  label,
  value,
  unit,
  sublabel,
  trend,
}: {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
  trend?: Trend;
}) {
  return (
    <motion.div
      variants={CARD_VARIANTS}
      className="rounded-2xl border border-line bg-surface/70 p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl transition-transform duration-200 ease-out hover:-translate-y-0.5"
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-4xl text-ink tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {(trend || sublabel) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {trend && (
            <span className={`inline-flex items-center gap-1 font-medium ${TONE_CLASSES[trend.tone]}`}>
              {trend.direction === "up" ? (
                <TrendUpIcon className="h-3.5 w-3.5" />
              ) : (
                <TrendDownIcon className="h-3.5 w-3.5" />
              )}
              {trend.label}
            </span>
          )}
          {sublabel && <span className="text-muted">{sublabel}</span>}
        </div>
      )}
    </motion.div>
  );
}

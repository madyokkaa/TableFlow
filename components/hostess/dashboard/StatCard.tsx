"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { TrendingDown as TrendDownIcon, TrendingUp as TrendUpIcon } from "lucide-react";
import { CARD_VARIANTS } from "./motionVariants";

type Trend = { label: string; direction: "up" | "down"; tone: "positive" | "negative" | "neutral" };

const TONE_CLASSES: Record<Trend["tone"], string> = {
  positive: "text-status-confirmed",
  negative: "text-status-cancelled",
  neutral: "text-[#a8958e]",
};

const CARD =
  "relative flex h-full flex-col gap-2.5 overflow-hidden rounded-[22px] border border-line bg-surface p-[22px] text-left transition-[transform,border-color] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]";

/** A KPI card. With `href` the whole card is a link into the screen behind
 * the number (and lifts on hover); `children` adds a visual under the value
 * - a load bar, a sparkline. */
export function StatCard({
  label,
  value,
  unit,
  sublabel,
  trend,
  href,
  ariaLabel,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
  trend?: Trend;
  href?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">{label}</span>
      <span className="flex items-baseline gap-1.5 font-display text-[44px] leading-none tabular-nums">
        {value}
        {unit && <small className="font-sans text-[13px] text-[#a8958e]">{unit}</small>}
      </span>
      {children}
      {(trend || sublabel) && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#a8958e]">
          {trend && (
            <span className={`inline-flex items-center gap-1 font-medium ${TONE_CLASSES[trend.tone]}`}>
              {trend.direction === "up" ? (
                <TrendUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {trend.label}
            </span>
          )}
          {sublabel && <span>{sublabel}</span>}
        </span>
      )}
    </>
  );

  return (
    <motion.div variants={CARD_VARIANTS} className="h-full">
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={`${CARD} hover:-translate-y-1 hover:border-[#4a3833]`}>
          {body}
        </Link>
      ) : (
        <div className={CARD}>{body}</div>
      )}
    </motion.div>
  );
}

/** Thin claret bar that grows to `percent` on mount. */
export function LoadBar({ percent }: { percent: number }) {
  return (
    <span className="block h-1 overflow-hidden rounded bg-[#2c2220]" aria-hidden="true">
      <i
        className="block h-full origin-left animate-[db-grow_1.2s_.3s_cubic-bezier(.6,0,.2,1)_both] rounded bg-claret"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  );
}

/** Tiny bar sparkline in the card's top-right corner; the last bar (today)
 * is claret. Values are scaled to the largest. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="absolute right-5 top-[22px] flex h-7 items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <i
          key={i}
          className={`block w-[5px] origin-bottom animate-[db-grow-y_.8s_cubic-bezier(.3,1.4,.5,1)_both] rounded-sm ${
            i === values.length - 1 ? "bg-claret" : "bg-[#4a3833]"
          }`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, animationDelay: `${200 + i * 60}ms` }}
        />
      ))}
    </span>
  );
}

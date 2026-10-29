"use client";

import { motion } from "motion/react";
import { CARD_VARIANTS } from "./motionVariants";

export function DashboardCard({
  title,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={CARD_VARIANTS}
      className={`flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-[22px] ${className ?? ""}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-[19px] font-normal text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}

/** "Все →"-style text link in a card header. */
export const CARD_LINK =
  "inline-flex min-h-9 items-center text-[13px] font-semibold text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong";

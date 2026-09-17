"use client";

import { motion } from "motion/react";
import { CARD_VARIANTS } from "./motionVariants";

export function DashboardCard({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={CARD_VARIANTS}
      className={`rounded-2xl border border-line bg-surface/70 p-5 shadow-[var(--shadow-elevated)] backdrop-blur-xl ${className ?? ""}`}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-base text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}

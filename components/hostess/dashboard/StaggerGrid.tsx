"use client";

import { motion, useReducedMotion } from "motion/react";

/** Wraps a row of dashboard cards so they fade/slide in one after another on
 * load instead of popping in together. Children opt in by passing
 * CARD_VARIANTS as their own `variants` prop - motion propagates this
 * parent's "hidden"/"show" trigger down to them automatically. Collapses to
 * an instant, non-staggered render when the OS asks for reduced motion. */
export function StaggerGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </motion.div>
  );
}

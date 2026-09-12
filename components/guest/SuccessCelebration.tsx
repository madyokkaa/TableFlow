"use client";

import { motion, useReducedMotion } from "motion/react";

const CONFETTI_COLORS = ["var(--color-claret)", "var(--color-gold)", "var(--color-status-confirmed)"];
const PARTICLE_COUNT = 10;

/** The "money shot" of a completed booking - a checkmark that draws itself
 * in, with a small confetti burst. Collapses to the static end-state
 * instantly when the OS asks for reduced motion. */
export function SuccessCelebration() {
  const reduceMotion = useReducedMotion();

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    return {
      x: Math.cos(angle) * 70,
      y: Math.sin(angle) * 70,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: 0.15 + (i % 4) * 0.03,
    };
  });

  return (
    <div className="relative mx-auto flex h-24 w-24 items-center justify-center" aria-hidden="true">
      {!reduceMotion &&
        particles.map((p, i) => (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, delay: p.delay, ease: "easeOut" }}
          />
        ))}
      <motion.div
        className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-status-confirmed bg-status-confirmed-tint"
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <motion.path
            d="M11 21 L17 27 L29 13"
            stroke="var(--color-status-confirmed)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
          />
        </svg>
      </motion.div>
    </div>
  );
}

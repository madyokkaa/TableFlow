"use client";

import { motion, useReducedMotion } from "motion/react";

const CONFETTI_COLORS = ["var(--color-claret)", "var(--color-gold)", "var(--color-status-confirmed)"];
const PARTICLE_COUNT = 14;

/** The "money shot" of a completed booking - a checkmark that draws itself
 * in over a soft expanding ring, with a confetti burst of varied size and
 * gentle rotation. Collapses to the static end-state instantly when the OS
 * asks for reduced motion. */
export function SuccessCelebration() {
  const reduceMotion = useReducedMotion();

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15);
    const distance = 64 + (i % 3) * 14;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotate: (i % 2 === 0 ? 1 : -1) * (90 + i * 12),
      size: i % 3 === 0 ? 3 : i % 3 === 1 ? 6 : 8,
      round: i % 2 === 0,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: 0.18 + (i % 5) * 0.035,
    };
  });

  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center" aria-hidden="true">
      {!reduceMotion && (
        <motion.span
          className="absolute h-20 w-20 rounded-full border-2 border-status-confirmed"
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 1.1, delay: 0.1, ease: "easeOut" }}
        />
      )}
      {!reduceMotion &&
        particles.map((p, i) => (
          <motion.span
            key={i}
            className={p.round ? "absolute rounded-full" : "absolute rounded-[2px]"}
            style={{ width: p.size, height: p.size, backgroundColor: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4, rotate: p.rotate }}
            transition={{ duration: 0.75, delay: p.delay, ease: "easeOut" }}
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

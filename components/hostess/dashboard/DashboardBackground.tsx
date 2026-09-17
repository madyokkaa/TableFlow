"use client";

import { motion, useReducedMotion } from "motion/react";

type Blob = { color: string; size: number; top: string; left: string; duration: number; delay: number };

const BLOBS: Blob[] = [
  { color: "var(--color-claret)", size: 480, top: "-14%", left: "58%", duration: 30, delay: 0 },
  { color: "var(--color-gold)", size: 360, top: "55%", left: "-10%", duration: 34, delay: 3 },
];

/** Atmospheric glow behind the dashboard's cards - the same slow-drifting
 * radial-gradient technique as the guest side's BackgroundBlobs, but dimmer
 * (opacity 0.1 vs 0.16) since it sits behind dense data, not an empty auth
 * screen. Purely decorative: absolutely positioned, non-interactive, and
 * collapses to a static placement under reduced motion. */
export function DashboardBackground() {
  const reduceMotion = useReducedMotion();

  return (
    // No overflow-hidden here on purpose - see BackgroundBlobs.tsx for why
    // clipping a still-opaque gradient at this container's edge reads as a
    // hard cut instead of a fade; <body> carries the overflow-x safety net.
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full opacity-[0.1] blur-3xl"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            background: `radial-gradient(circle, ${blob.color}, transparent 70%)`,
          }}
          animate={reduceMotion ? undefined : { x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: blob.duration, delay: blob.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

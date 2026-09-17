"use client";

import { motion, useReducedMotion } from "motion/react";

type Blob = {
  color: string;
  size: number;
  top: string;
  left: string;
  duration: number;
  delay: number;
};

const BLOBS: Blob[] = [
  { color: "var(--color-claret)", size: 560, top: "-14%", left: "-10%", duration: 26, delay: 0 },
  { color: "var(--color-gold)", size: 460, top: "52%", left: "68%", duration: 32, delay: 2 },
  { color: "var(--color-claret)", size: 380, top: "68%", left: "-8%", duration: 22, delay: 4 },
];

/** Slow-drifting decorative gradient shapes for entry/auth screens - purely
 * atmospheric, sits behind content, never intercepts clicks. Each blob
 * drifts and breathes (a slow opacity/scale pulse, deliberately out of
 * phase with the drift so the glow never feels mechanical) rather than just
 * translating in place. Collapses to a static placement when the OS asks
 * for reduced motion. */
export function BackgroundBlobs() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            background: `radial-gradient(circle, ${blob.color}, transparent 70%)`,
            opacity: reduceMotion ? 0.16 : undefined,
          }}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: [0, 40, -30, 0],
                  y: [0, -30, 20, 0],
                  scale: [1, 1.15, 0.94, 1],
                  opacity: [0.13, 0.22, 0.15, 0.13],
                }
          }
          transition={{ duration: blob.duration, delay: blob.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

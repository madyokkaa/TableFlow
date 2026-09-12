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
  { color: "var(--color-claret)", size: 520, top: "-12%", left: "-8%", duration: 26, delay: 0 },
  { color: "var(--color-gold)", size: 420, top: "55%", left: "70%", duration: 32, delay: 2 },
  { color: "var(--color-claret)", size: 340, top: "70%", left: "-6%", duration: 22, delay: 4 },
];

/** Slow-drifting decorative gradient shapes for entry/auth screens - purely
 * atmospheric, sits behind content, never intercepts clicks. Collapses to a
 * static (non-animated) placement when the OS asks for reduced motion. */
export function BackgroundBlobs() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full opacity-[0.16] blur-3xl"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            background: `radial-gradient(circle, ${blob.color}, transparent 70%)`,
          }}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: [0, 40, -30, 0],
                  y: [0, -30, 20, 0],
                  scale: [1, 1.08, 0.96, 1],
                }
          }
          transition={{ duration: blob.duration, delay: blob.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

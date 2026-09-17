"use client";

import { motion, useReducedMotion } from "motion/react";

type Particle = { top: string; left: string; size: number; duration: number; delay: number; gold?: boolean };

const PARTICLES: Particle[] = [
  { top: "18%", left: "12%", size: 4, duration: 14, delay: 0 },
  { top: "72%", left: "22%", size: 3, duration: 18, delay: 2.5, gold: true },
  { top: "38%", left: "88%", size: 5, duration: 16, delay: 1 },
  { top: "84%", left: "76%", size: 3, duration: 20, delay: 4 },
  { top: "10%", left: "62%", size: 3, duration: 17, delay: 3 },
  { top: "55%", left: "6%", size: 4, duration: 15, delay: 5, gold: true },
];

/** A handful of soft, slow-drifting light motes - deliberately few and dim,
 * a texture the eye registers without noticing it was placed. Sits behind
 * content alongside BackgroundBlobs, never intercepts clicks, and
 * disappears under reduced motion rather than freezing mid-drift. */
export function FloatingParticles() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.gold ? "var(--color-gold)" : "var(--color-claret-strong)",
          }}
          animate={{
            y: [0, -18, 0],
            x: [0, 6, 0],
            opacity: [0, 0.35, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

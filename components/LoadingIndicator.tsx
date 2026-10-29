"use client";

import { motion, useReducedMotion } from "motion/react";

const DOT_COUNT = 3;

/** Branded stand-in for a bare spinner - three dots rising in sequence,
 * in the current text color so it drops into a button or inline text.
 * Used for operations that can take a noticeable moment (booking
 * submission, sign-in). motion's JS-driven animations aren't touched by the
 * global CSS `prefers-reduced-motion` override in globals.css (that only
 * catches actual CSS `animation`/`transition`), so this needs its own
 * check, same as its siblings (BackgroundBlobs, SuccessCelebration). */
export function LoadingIndicator({ label }: { label?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-center gap-1" role="status" aria-label={label ?? "Загрузка"}>
        {Array.from({ length: DOT_COUNT }).map((_, i) =>
          reduceMotion ? (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          ) : (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-current"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          )
        )}
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}

"use client";

import { motion } from "motion/react";
import { Minus, Plus } from "lucide-react";

export function PartyStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Гостей</span>
      <span className="flex items-center gap-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          onClick={() => onChange(Math.max(1, value - 1))}
          aria-label="Меньше гостей"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors duration-150 hover:border-claret"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
        </motion.button>
        <span className="w-6 text-center font-mono tabular-nums text-ink">{value}</span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          onClick={() => onChange(Math.min(20, value + 1))}
          aria-label="Больше гостей"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors duration-150 hover:border-claret"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </motion.button>
      </span>
    </label>
  );
}

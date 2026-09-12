"use client";

import { motion } from "motion/react";
import { BackgroundBlobs } from "./BackgroundBlobs";

/** Shared premium-styled shell for the guest auth screens (login, register,
 * forgot/reset password) - centered card over the drifting background,
 * with a soft spring entrance. Not used by the hostess side, which keeps
 * its plainer, denser utilitarian style on purpose. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh w-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <BackgroundBlobs />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.2, 0.64, 1] }}
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface/95 p-8 shadow-[var(--shadow-floating)] backdrop-blur-sm"
      >
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">TableFlow</p>
        <h1 className="mt-2 font-display text-3xl text-ink text-balance">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-pretty text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </motion.div>
    </main>
  );
}

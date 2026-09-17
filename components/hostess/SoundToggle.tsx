"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bell, BellOff } from "lucide-react";
import { isSoundEnabled, setSoundEnabled, unlockAudio } from "@/lib/notificationSound";

export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a persisted preference on mount
    setEnabled(isSoundEnabled());
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
    if (next) unlockAudio(); // this click also doubles as the required user-gesture unlock
  }

  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Звук уведомлений включён" : "Звук уведомлений выключен"}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-paper hover:text-ink"
    >
      {enabled ? <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <BellOff className="h-[18px] w-[18px]" strokeWidth={1.75} />}
    </motion.button>
  );
}

"use client";

import { useEffect, useState } from "react";
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
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Звук уведомлений включён" : "Звук уведомлений выключен"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:bg-paper hover:text-ink"
    >
      {enabled ? "🔔" : "🔕"}
    </button>
  );
}

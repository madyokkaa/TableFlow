"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { isSoundEnabled, setSoundEnabled, unlockAudio } from "@/lib/notificationSound";

/** Icon-only on/off switch for the new-booking sound, sized for the staff
 * sidebar's user card. */
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
      role="switch"
      aria-checked={enabled}
      aria-label="Звук уведомлений"
      title={enabled ? "Звук уведомлений включён" : "Звук уведомлений выключен"}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-[background-color,color,transform] duration-200 ease-out hover:bg-claret-tint hover:text-claret active:scale-90"
    >
      {enabled ? (
        <Bell className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <BellOff className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}

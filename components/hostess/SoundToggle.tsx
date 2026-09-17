"use client";

import { useEffect, useState } from "react";
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
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Звук уведомлений включён" : "Звук уведомлений выключен"}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-line/50 hover:text-ink active:scale-[0.97]"
    >
      {enabled ? (
        <Bell className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      ) : (
        <BellOff className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      )}
      <span className="hidden lg:inline">{enabled ? "Звук включён" : "Звук выключен"}</span>
    </button>
  );
}

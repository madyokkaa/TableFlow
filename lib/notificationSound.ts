"use client";

const STORAGE_KEY = "tableflow.sound-enabled";
let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode) - the toggle just won't persist.
  }
}

/** Browsers block audio until a real user gesture unlocks the AudioContext -
 * call this from a click handler (the sound toggle, or any first click on
 * the admin shell) before the first notification is due. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

/** Short, unobtrusive two-tone ping for a new reservation - synthesized via
 * Web Audio so no binary asset file needs to live in the repo. */
export function playNotificationSound(): void {
  if (!isSoundEnabled()) return;
  try {
    unlockAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1175, now + 0.12);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Playback can fail for reasons that have nothing to do with the rest
    // of the app (autoplay policy, no audio device) - never let it throw.
  }
}

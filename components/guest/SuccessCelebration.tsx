"use client";

import { useEffect, useRef } from "react";
import { formatTime, guestsLabel } from "@/lib/ru";
import { shortDayLabel } from "./BookingPanel";

const BURST_COLORS = ["bg-claret", "bg-status-pending", "bg-status-confirmed"];

/** Booking-confirmed "ticket": a drawn checkmark with a confetti burst, the
 * booking details on a perforated stub, and the reservation code. Shown as
 * a modal dialog over the page. */
export function SuccessCelebration({
  tableLabel,
  hallName,
  date,
  time,
  partySize,
  reservationId,
  registerHref,
  onClose,
}: {
  tableLabel: string;
  hallName: string;
  date: string;
  time: string;
  partySize: number;
  reservationId: number | null;
  /** Set for anonymous guests: offer to keep their details in an account. */
  registerHref: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Заявка на бронь отправлена"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(10_7_6/0.74)] p-4 backdrop-blur-md animate-[fp-fadein_.3s_both]"
    >
      <div className="relative w-full max-w-[420px] animate-[gp-rise_.7s_cubic-bezier(.2,.9,.3,1.25)_both] rounded-[26px] bg-ink px-[30px] pb-7 pt-[34px] text-center text-[#1d1614]">
        <div className="relative mx-auto mb-3.5 h-[76px] w-[76px]">
          <svg width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
            <circle
              cx="38"
              cy="38"
              r="34"
              stroke="#1d1614"
              strokeWidth="3"
              strokeDasharray="220"
              strokeDashoffset="220"
              className="animate-[gp-stroke_.7s_.25s_cubic-bezier(.6,0,.2,1)_forwards]"
            />
            <path
              d="M25 39l9 9 17-19"
              stroke="#1d1614"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="60"
              strokeDashoffset="60"
              className="animate-[gp-stroke_.45s_.85s_cubic-bezier(.6,0,.2,1)_forwards]"
            />
          </svg>
          <span className="absolute left-1/2 top-1/2 h-0 w-0" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="absolute left-0 top-0" style={{ transform: `rotate(${i * 30}deg)` }}>
                <span
                  className={`absolute -left-1 -top-1 h-2 w-2 animate-[gp-fly_1s_.8s_cubic-bezier(.1,.7,.3,1)_both] rounded-[2px] ${BURST_COLORS[i % 3]}`}
                />
              </span>
            ))}
          </span>
        </div>

        <h2 className="font-display text-[30px] font-normal leading-[1.1]">Заявка принята</h2>
        <p className="mt-1.5 text-sm text-[#6b5852]">
          Мы ждём вас. Как только ресторан подтвердит бронь, она отметится в «Мои брони».
        </p>

        <div
          className="relative -mx-[30px] my-[22px] h-px border-t-2 border-dashed border-[#d8c9c2] before:absolute before:-left-3 before:-top-[13px] before:h-6 before:w-6 before:rounded-full before:bg-[#140f0e] after:absolute after:-right-3 after:-top-[13px] after:h-6 after:w-6 after:rounded-full after:bg-[#140f0e]"
          aria-hidden="true"
        />

        <dl className="text-sm">
          {[
            ["Стол", `№ ${tableLabel} · ${hallName.toLowerCase()}`],
            ["Дата", shortDayLabel(date)],
            ["Время", formatTime(time)],
            ["Гостей", guestsLabel(partySize)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5">
              <dt className="text-[#6b5852]">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {reservationId !== null && (
          <p className="mt-1.5 font-mono text-[13px] tracking-[0.18em] text-[#6b5852]">TF-{reservationId}</p>
        )}

        {registerHref && (
          <p className="mt-4 rounded-xl bg-[#e9ddd6] px-3.5 py-3 text-left text-[13px] text-[#4a3a35]">
            Сохраните свои данные — в следующий раз не придётся вводить их заново.{" "}
            <a href={registerHref} className="font-semibold text-[#8a2f45] underline underline-offset-4">
              Создать аккаунт
            </a>
          </p>
        )}

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-[18px] h-[52px] w-full rounded-[14px] bg-[#1d1614] font-bold text-ink transition-transform duration-200 active:scale-[0.98]"
        >
          Отлично
        </button>
      </div>
    </div>
  );
}

import { Check } from "lucide-react";

const CHAIRS = [0, 90, 180, 270].map((angle, i) => ({ angle, enter: 150 + i * 120, lag: i * 70 }));

/** The left half of the guest auth card: a round table that sets itself as
 * the form fills in - a plate per chair once the email looks valid, a glass
 * once the second field is good, a napkin for the third, chairs pulled out
 * when everything is ready and turned claret on success. Purely decorative;
 * the steps underneath repeat the progress in text. */
export function SetTableScene({
  plates,
  glasses,
  napkins,
  ready,
  done,
  caption,
  steps,
}: {
  plates: boolean;
  glasses: boolean;
  napkins: boolean;
  ready: boolean;
  done: boolean;
  caption: string;
  steps: { label: string; on: boolean }[];
}) {
  return (
    <div className="relative flex min-h-[340px] flex-col items-center justify-center gap-[26px] border-b border-[#2c2220] bg-[#17110f] bg-[radial-gradient(#2a201d_1px,transparent_1px)] bg-[length:18px_18px] px-6 py-9 md:border-b-0 md:border-r">
      <div className={`ga-scene max-[380px]:scale-90 ${ready ? "out" : ""} ${done ? "done" : ""}`} aria-hidden="true">
        {CHAIRS.map((c) => (
          <span key={c.angle} className="ga-arm" style={{ transform: `rotate(${c.angle}deg)` }}>
            <span className="ga-chair" style={{ animationDelay: `${c.enter}ms`, transitionDelay: `${c.lag}ms` }} />
          </span>
        ))}
        <span className="ga-top" />
        {CHAIRS.map((c) => (
          <span key={c.angle} className="ga-arm" style={{ transform: `rotate(${c.angle}deg)` }}>
            <span className={`ga-plate ${plates ? "on" : ""}`} style={{ transitionDelay: `${c.lag}ms` }} />
            <span className={`ga-glass ${glasses ? "on" : ""}`} style={{ transitionDelay: `${120 + c.lag}ms` }} />
            <span className={`ga-napkin ${napkins ? "on" : ""}`} style={{ transitionDelay: `${c.lag}ms` }} />
          </span>
        ))}
        <span className="ga-candle" />
        <span className="ga-flame" />
      </div>
      <div key={caption} className="min-h-[30px] animate-[gp-up_.5s_both] text-center font-display text-[22px] italic text-[#e6d8d2]" aria-live="polite">
        {caption}
      </div>
      <ul className="flex flex-wrap justify-center gap-[18px] text-xs text-[#8f7c75]" aria-label="Готовность формы">
        {steps.map((s) => (
          <li key={s.label} className={`ga-step inline-flex items-center gap-[7px] transition-colors duration-400 ${s.on ? "on text-ink" : ""}`}>
            <i
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] ${
                s.on ? "border-status-confirmed bg-status-confirmed text-[#13261a]" : "border-[#4a3833]"
              }`}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden="true" />
            </i>
            {s.label}
            <span className="sr-only">{s.on ? " — готово" : " — не заполнено"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

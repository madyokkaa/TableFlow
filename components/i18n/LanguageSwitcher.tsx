"use client";

import { LANGS, LANG_LABELS, LANG_NAMES } from "@/lib/i18n/config";
import { useI18n } from "./I18nProvider";

/** KZ / RU / EN segmented switch. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t.common.language} className={`inline-flex rounded-[11px] border border-line-strong bg-[#1a1311] p-[3px] ${className}`}>
      {LANGS.map((code) => {
        const on = code === lang;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={on}
            lang={code}
            title={LANG_NAMES[code]}
            onClick={() => setLang(code)}
            className={`min-h-9 min-w-10 rounded-[8px] px-2.5 font-mono text-[11px] tracking-[0.12em] transition-colors ${
              on ? "bg-[#2e1c21] text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {LANG_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}

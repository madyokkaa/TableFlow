"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n/config";
import { MESSAGES, type Messages } from "@/lib/i18n/messages";
import { formatters, type Formatters } from "@/lib/i18n/format";

type I18n = {
  lang: Lang;
  t: Messages;
  f: Formatters;
  /** "4 гостя" in the current language. */
  guests: (n: number) => string;
  /** Our API's (Russian) error text in the current language, or as is. */
  serverError: (message: string) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18n | null>(null);

/** The guest-facing language: starts from the server's reading of the
 * cookie (so the first paint is already in the right language), switching
 * rewrites the cookie and re-renders server parts. `fixed` pins a subtree
 * to one language - the staff panel stays Russian. */
export function I18nProvider({ lang: initial, fixed = false, children }: { lang: Lang; fixed?: boolean; children: ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback(
    (next: Lang) => {
      if (fixed) return;
      setLangState(next);
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      // Server Components (the privacy page, <html lang>) read the cookie.
      router.refresh();
    },
    [fixed, router]
  );

  const value = useMemo<I18n>(() => {
    const t = MESSAGES[lang];
    const f = formatters(lang);
    return {
      lang,
      t,
      f,
      guests: (n) => f.count(n, t.common.guests),
      serverError: (message) => {
        const key = message.trim();
        return t.serverErrors[key] ?? t.serverErrors[key.replace(/\.$/, "")] ?? message;
      },
      setLang,
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

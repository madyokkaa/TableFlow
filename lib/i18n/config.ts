/** The site's languages. Russian is the source and the default; the choice
 * is kept in a cookie so server-rendered pages (and the <html lang>) match
 * what the guest picked. */
export const LANGS = ["kk", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "ru";
export const LANG_COOKIE = "tf_lang";

/** What the switcher shows for each language. */
export const LANG_LABELS: Record<Lang, string> = { kk: "KZ", ru: "RU", en: "EN" };
export const LANG_NAMES: Record<Lang, string> = { kk: "Қазақша", ru: "Русский", en: "English" };

/** BCP 47 locale for Intl (dates, plurals). */
export const INTL_LOCALE: Record<Lang, string> = { kk: "kk-KZ", ru: "ru-RU", en: "en-GB" };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

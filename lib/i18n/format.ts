import { INTL_LOCALE, type Lang } from "./config";
import type { PluralForms } from "./messages";

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Browsers often ship without Kazakh calendar data (Chrome prints "M11" and
// English weekdays for kk-KZ), so Kazakh dates are spelled out here.
const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const KK_MONTHS_SHORT = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"];
const KK_WEEKDAYS = ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"];
const KK_WEEKDAYS_SHORT = ["жс", "дс", "сс", "ср", "бс", "жм", "сб"];

function kkDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const d = fromIso(iso);
  const weekday =
    options.weekday === "long" ? KK_WEEKDAYS[d.getDay()] : options.weekday ? KK_WEEKDAYS_SHORT[d.getDay()] : "";
  if (!options.day) return options.month ? KK_MONTHS_SHORT[d.getMonth()] : weekday;
  const date = `${d.getDate()} ${KK_MONTHS[d.getMonth()]}`;
  return weekday ? `${date}, ${weekday}` : date;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Date, number and plural formatting for one language. */
export function formatters(lang: Lang) {
  const locale = INTL_LOCALE[lang];
  const rules = new Intl.PluralRules(locale);
  const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
    lang === "kk" ? kkDate(iso, options) : fromIso(iso).toLocaleDateString(locale, options);
  const plural = (n: number, forms: PluralForms) => forms[rules.select(n) as keyof PluralForms] ?? forms.other;
  return {
    plural,
    /** "4 гостя" / "4 guests" / "4 қонақ" */
    count: (n: number, forms: PluralForms) => `${n} ${plural(n, forms)}`,
    /** "пт, 3 октября" */
    dayShort: (iso: string) => date(iso, { weekday: "short", day: "numeric", month: "long" }),
    /** "Пт, 3 октября" */
    dayShortCapital: (iso: string) => capitalize(date(iso, { weekday: "short", day: "numeric", month: "long" })),
    /** "пятница, 3 октября" */
    dayLong: (iso: string) => date(iso, { weekday: "long", day: "numeric", month: "long" }),
    /** "3 октября" */
    dateShort: (iso: string) => date(iso, { day: "numeric", month: "long" }),
    weekdayShort: (iso: string) => date(iso, { weekday: "short" }),
    monthShort: (iso: string) => date(iso, { month: "short" }).replace(".", ""),
    time: (time: string) => time.slice(0, 5),
    /** "3 октября, 19:00" */
    dateTime: (iso: string, time: string) => `${date(iso, { day: "numeric", month: "long" })}, ${time.slice(0, 5)}`,
  };
}

export type Formatters = ReturnType<typeof formatters>;

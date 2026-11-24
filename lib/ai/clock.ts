import { addDaysIso, FALLBACK_TIME_ZONE, isValidTimeZone, restaurantNowMinutes, restaurantTodayIso } from "@/lib/scheduling";

/** The restaurant's zone for server-side code with no browser to ask - the
 * Telegram bot, cron jobs, evals: RESTAURANT_TIME_ZONE when it's a real IANA
 * zone, otherwise the app-wide fallback. */
export function botTimeZone(): string {
  const configured = process.env.RESTAURANT_TIME_ZONE?.trim();
  return configured && isValidTimeZone(configured) ? configured : FALLBACK_TIME_ZONE;
}

export type RestaurantClock = { timeZone: string; todayIso: string; nowMinutes: number };

/** "Today" and "now" in the restaurant's zone at the instant `now`. */
export function restaurantClock(now: Date = new Date(), timeZone: string = botTimeZone()): RestaurantClock {
  const at = now.getTime();
  return { timeZone, todayIso: restaurantTodayIso(timeZone, at), nowMinutes: restaurantNowMinutes(timeZone, at) };
}

export const WEEKDAYS_KK = ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"] as const;
export const WEEKDAYS_RU = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"] as const;
export const MONTHS_KK = [
  "қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
  "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан",
] as const;
export const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/** 0 = Sunday, for a plain YYYY-MM-DD calendar date. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type DateRow = { iso: string; weekdayKk: string; weekdayRu: string; relative: string | null };

const RELATIVE = ["бүгін / сегодня", "ертең / завтра", "арғы күні / послезавтра"];

/** The next `days` calendar dates from today, computed by code so the model
 * picks a date from the table instead of doing calendar arithmetic. */
export function upcomingDates(todayIso: string, days = 14): DateRow[] {
  return Array.from({ length: days }, (_, i) => {
    const iso = addDaysIso(todayIso, i);
    const wd = weekdayOf(iso);
    return { iso, weekdayKk: WEEKDAYS_KK[wd], weekdayRu: WEEKDAYS_RU[wd], relative: RELATIVE[i] ?? null };
  });
}

/** "31 қазан, жұма" / "31 октября, пятница" - dates are spelled out to the
 * guest so a misheard day is easy to spot. */
export function formatDateWords(iso: string, lang: "kk" | "ru"): string {
  const [, m, d] = iso.split("-").map(Number);
  const wd = weekdayOf(iso);
  return lang === "kk" ? `${d} ${MONTHS_KK[m - 1]}, ${WEEKDAYS_KK[wd]}` : `${d} ${MONTHS_RU[m - 1]}, ${WEEKDAYS_RU[wd]}`;
}

/** Shared Russian formatting helpers (dates, plurals) used across the guest
 * and hostess UI. No i18n library - strings are hardcoded in Russian for
 * this phase, per the project's current scope. */

export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function guestsLabel(n: number): string {
  return `${n} ${pluralize(n, "гость", "гостя", "гостей")}`;
}

/** Formats a number with a comma decimal separator (2.3 -> "2,3"), the
 * Russian convention - JS's toString()/template interpolation always uses
 * a period, which would look like a typo next to the rest of a Russian UI. */
export function formatRuNumber(n: number): string {
  return n.toString().replace(".", ",");
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLong(iso: string): string {
  return fromIso(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateShort(iso: string): string {
  return fromIso(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function formatWeekday(iso: string): string {
  const label = fromIso(iso).toLocaleDateString("ru-RU", { weekday: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatDateTime(iso: string, time: string): string {
  return `${formatDateShort(iso)}, ${formatTime(time)}`;
}

/** The KZ/RU/EN switch: plurals, dates and the server-error lookup. */
import { describe, expect, it } from "vitest";
import { formatters } from "../lib/i18n/format";
import { MESSAGES } from "../lib/i18n/messages";
import { LANGS } from "../lib/i18n/config";

describe("i18n formatters", () => {
  it("picks the plural form for each language", () => {
    const g = (lang: "ru" | "en" | "kk", n: number) => formatters(lang).count(n, MESSAGES[lang].common.guests);
    expect([1, 2, 5, 21].map((n) => g("ru", n))).toEqual(["1 гость", "2 гостя", "5 гостей", "21 гость"]);
    expect([1, 4].map((n) => g("en", n))).toEqual(["1 guest", "4 guests"]);
    expect(g("kk", 4)).toBe("4 қонақ");
  });

  it("spells Kazakh dates without relying on the browser's locale data", () => {
    const f = formatters("kk");
    expect(f.dayShort("2026-11-08")).toBe("8 қараша, жс");
    expect(f.dayLong("2026-11-09")).toBe("9 қараша, дүйсенбі");
    expect(f.weekdayShort("2026-11-13")).toBe("жм");
    expect(f.monthShort("2026-01-05")).toBe("қаң");
    expect(f.dateTime("2026-12-31", "19:30:00")).toBe("31 желтоқсан, 19:30");
  });

  it("translates every known server error in every language", () => {
    const keys = Object.keys(MESSAGES.ru.serverErrors);
    for (const lang of LANGS) {
      expect(Object.keys(MESSAGES[lang].serverErrors).sort()).toEqual([...keys].sort());
      expect(Object.keys(MESSAGES[lang].reasons).sort()).toEqual(Object.keys(MESSAGES.ru.reasons).sort());
    }
  });
});

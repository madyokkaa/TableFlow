import { addDaysIso } from "@/lib/scheduling";
import type { RawExtraction } from "./bookingFields";
import { weekdayOf, type RestaurantClock } from "./clock";

// The no-AI baseline: a couple of dozen hand-written rules that read the
// same five fields out of a message. It is what the bot falls back to when
// the model is unavailable, and the yardstick the eval compares the model
// against - deliberately not an attempt to cover everything.

// Word boundaries that work for Cyrillic (JS \b is ASCII-only).
const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}])";
const re = (source: string) => new RegExp(source, "iu");

const KAZAKH_LETTERS = /[әғқңөұүһі]/i;

// 0 = Sunday. Kazakh weekday names take suffixes (жұмаға, сенбіде), so only
// the start is anchored; "сенбі" is guarded by B so it can't match inside
// "дүйсенбі".
const WEEKDAY_RULES: [RegExp, number][] = [
  [re(`${B}(жексенбі|воскресень)`), 0],
  [re(`${B}(дүйсенбі|понедельник)`), 1],
  [re(`${B}(сейсенбі|вторник)`), 2],
  [re(`${B}(сәрсенбі|сред[аyу]${E})`), 3],
  [re(`${B}(бейсенбі|четверг)`), 4],
  [re(`${B}(жұма|пятниц)`), 5],
  [re(`${B}(сенбі|суббот)`), 6],
];

const MONTH_STEMS: [RegExp, number][] = [
  [re(`^(қаңтар|январ)`), 1],
  [re(`^(ақпан|феврал)`), 2],
  [re(`^(наурыз|март)`), 3],
  [re(`^(сәуір|апрел)`), 4],
  [re(`^(мамыр|ма[йя])`), 5],
  [re(`^(маусым|июн)`), 6],
  [re(`^(шілде|июл)`), 7],
  [re(`^(тамыз|август)`), 8],
  [re(`^(қыркүйек|сентябр)`), 9],
  [re(`^(қазан|октябр)`), 10],
  [re(`^(қараша|ноябр)`), 11],
  [re(`^(желтоқсан|декабр)`), 12],
];

const NUMBER_WORDS: Record<string, number> = {
  бір: 1, екі: 2, үш: 3, төрт: 4, бес: 5, алты: 6, жеті: 7, сегіз: 8, тоғыз: 9, он: 10,
  один: 1, одного: 1, два: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, четырёх: 4, четырех: 4,
  пять: 5, пяти: 5, шесть: 6, шести: 6, семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10,
};

// "we two" style words, Kazakh collective numerals and Russian adverbs.
const GROUP_WORDS: [RegExp, number][] = [
  [re(`${B}(екеуміз|екеуімізге|вдвоём|вдвоем|на двоих|двое)`), 2],
  [re(`${B}(үшеуміз|үшеумізге|втроём|втроем|на троих|трое)`), 3],
  [re(`${B}(төртеуміз|төртеумізге|вчетвером|на четверых|четверо)`), 4],
  [re(`${B}(бесеуміз|бесеумізге|впятером|на пятерых|пятеро)`), 5],
];

const PEOPLE = "(?:адам|кісі|человек|чел|персон|гост)";

const WISHES: RegExp[] = [
  re(`${B}(терезе жан\\p{L}*|у окна)`),
  re(`${B}(балалар орындығ\\p{L}*|детск\\p{L}* стул\\p{L}*)`),
  re(`${B}(туған күн\\p{L}*|день рождени\\p{L}*)`),
  re(`${B}(тыныш жер\\p{L}*|тих\\p{L}* мест\\p{L}*)`),
];

function nextWeekday(todayIso: string, weekday: number): string {
  // The nearest such day from today on (today included).
  const diff = (weekday - weekdayOf(todayIso) + 7) % 7;
  return addDaysIso(todayIso, diff);
}

function isoFromDayMonth(day: number, month: number, todayIso: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = Number(todayIso.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  let iso = `${year}-${pad(month)}-${pad(day)}`;
  // A day-month already behind us this year means next year's.
  if (iso < todayIso) {
    year += 1;
    iso = `${year}-${pad(month)}-${pad(day)}`;
  }
  return iso;
}

function findDate(text: string, todayIso: string): string | null {
  // Order matters: "послезавтра" contains "завтра".
  if (re(`${B}(арғы күні|бүрсігүні|бүрсүгүні|послезавтра)`).test(text)) return addDaysIso(todayIso, 2);
  if (re(`${B}(ертең|завтра)`).test(text)) return addDaysIso(todayIso, 1);
  if (re(`${B}(бүгін|сегодня)`).test(text)) return todayIso;

  // 31.10 / 31.10.2026 / 31/10 - a dotted pair is a date only when the
  // second number can be a month (19.30 is a time).
  const numeric = text.match(/(?<![\d.:])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:])/u);
  if (numeric && Number(numeric[2]) >= 1 && Number(numeric[2]) <= 12) {
    return isoFromDayMonth(Number(numeric[1]), Number(numeric[2]), todayIso);
  }

  // 31 қазан / 31-қазан / 31 октября
  const worded = text.match(/(?<![\d])(\d{1,2})[\s-]+(\p{L}+)/gu) ?? [];
  for (const chunk of worded) {
    const [, day, word] = chunk.match(/(\d{1,2})[\s-]+(\p{L}+)/u)!;
    const month = MONTH_STEMS.find(([stem]) => stem.test(word));
    if (month) return isoFromDayMonth(Number(day), month[1], todayIso);
  }

  for (const [rule, weekday] of WEEKDAY_RULES) {
    if (rule.test(text)) return nextWeekday(todayIso, weekday);
  }
  return null;
}

function hhmm(h: number, m = 0): string | null {
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function lastMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  const all = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"))];
  return all.length ? all[all.length - 1] : null;
}

function findTime(text: string): string | null {
  // "кешкі 7", "кешкі 7-ге", "7 вечера", "в 7 вечера" - evening.
  const evening =
    lastMatch(text, re(`${B}кешкі\\s*(\\d{1,2})(?:[:.](\\d{2}))?`)) ??
    lastMatch(text, re(`(?<![\\d])(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:-?\\p{L}{0,3}\\s*)?вечер`));
  if (evening) {
    const h = Number(evening[1]);
    return hhmm(h < 12 ? h + 12 : h, Number(evening[2] ?? 0));
  }
  // "түскі 2", "2 дня", "в 2 часа дня" - afternoon.
  const afternoon =
    lastMatch(text, re(`${B}түскі\\s*(\\d{1,2})(?:[:.](\\d{2}))?`)) ??
    lastMatch(text, re(`(?<![\\d])(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:час\\p{L}*\\s*)?дня${E}`));
  if (afternoon) {
    const h = Number(afternoon[1]);
    return hhmm(h < 12 ? h + 12 : h, Number(afternoon[2] ?? 0));
  }
  // 19:00 / 19.30 (a dotted pair whose minutes can't be a month).
  const clock = lastMatch(text, /(?<![\d.])(\d{1,2})[:.](\d{2})(?![\d.])/u);
  if (clock && (clock[0].includes(":") || Number(clock[2]) > 12 || clock[2] === "00")) {
    return hhmm(Number(clock[1]), Number(clock[2]));
  }
  // "сағат 7", "в 7", "7-ге" / "7-де" - a bare hour; the restaurant opens at
  // noon, so 1..11 reads as afternoon/evening.
  const bare =
    lastMatch(text, re(`${B}(?:сағат|в)\\s+(\\d{1,2})${E}(?!\\s*(?:${PEOPLE}|числ|\\.|/))`)) ??
    lastMatch(text, re(`(?<![\\d])(\\d{1,2})-?(?:ге|де|ке|те)${E}`));
  if (bare) {
    const h = Number(bare[1]);
    return hhmm(h >= 1 && h < 12 ? h + 12 : h);
  }
  return null;
}

function findPartySize(text: string): number | null {
  const numeric = text.match(re(`(?<![\\d:.])(\\d{1,3})\\s*-?\\s*${PEOPLE}`));
  if (numeric) return Number(numeric[1]);
  const worded = text.match(re(`${B}(\\p{L}+)\\s+${PEOPLE}`));
  if (worded && NUMBER_WORDS[worded[1].toLowerCase()]) return NUMBER_WORDS[worded[1].toLowerCase()];
  for (const [rule, size] of GROUP_WORDS) {
    if (rule.test(text)) return size;
  }
  return null;
}

function findName(text: string): string | null {
  const match = text.match(re(`${B}(?:менің атым|атым|есімім|меня зовут|зовут|я\\s*[—–-])\\s*([\\p{L}][\\p{L}'-]{1,40})`));
  if (!match) return null;
  const name = match[1];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function findWishes(text: string): string | null {
  const found = WISHES.map((rule) => text.match(rule)?.[1]).filter((w): w is string => !!w);
  return found.length ? found.join(", ") : null;
}

export function baselineExtract(text: string, clock: Pick<RestaurantClock, "todayIso">): RawExtraction {
  const clean = text.replace(/\s+/g, " ").trim();
  return {
    date: findDate(clean, clock.todayIso),
    time: findTime(clean),
    party_size: findPartySize(clean),
    name: findName(clean),
    wishes: findWishes(clean),
    lang: KAZAKH_LETTERS.test(clean) ? "kk" : "ru",
    unclear: [],
  };
}

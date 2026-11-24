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

// Hours said in words - what speech recognition usually writes out.
const HOURS_KK: [string, number][] = [
  ["он бір", 11], ["он екі", 12], ["бір", 1], ["екі", 2], ["үш", 3], ["төрт", 4], ["бес", 5],
  ["алты", 6], ["жеті", 7], ["сегіз", 8], ["тоғыз", 9], ["он", 10],
];
const HOURS_RU: [string, number][] = [
  ["одиннадцать", 11], ["одиннадцати", 11], ["двенадцать", 12], ["двенадцати", 12], ["час", 1], ["часу", 1],
  ["два", 2], ["двух", 2], ["три", 3], ["трёх", 3], ["трех", 3], ["четыре", 4], ["четырёх", 4], ["четырех", 4],
  ["пять", 5], ["пяти", 5], ["шесть", 6], ["шести", 6], ["семь", 7], ["семи", 7], ["восемь", 8], ["восьми", 8],
  ["девять", 9], ["девяти", 9], ["десять", 10], ["десяти", 10],
];
// "в половине восьмого" / "полвосьмого" = 7:30.
const ORDINALS_RU: [string, number][] = [
  ["первого", 1], ["второго", 2], ["третьего", 3], ["четвёртого", 4], ["четвертого", 4], ["пятого", 5], ["шестого", 6],
  ["седьмого", 7], ["восьмого", 8], ["девятого", 9], ["десятого", 10], ["одиннадцатого", 11], ["двенадцатого", 12],
];

const alt = (pairs: [string, number][]) => pairs.map(([w]) => w).join("|");
const lookup = (pairs: [string, number][], word: string) => pairs.find(([w]) => w === word.toLowerCase())?.[1];
// The restaurant opens at noon, so a spoken 1..11 means afternoon/evening.
const pm = (hour: number) => (hour < 12 ? hour + 12 : hour);

/** Rewrites hours spoken in words as digits, only where they clearly mean a
 * time, so the digit rules below can read them: "кешкі жетіге" → "кешкі 7ге",
 * "жеті жарымда" → "7:30", "в семь вечера" → "в 7 вечера", "в половине
 * восьмого" → "в 7:30". Party sizes ("төрт адам", "семь человек") are left
 * alone. */
export function spokenTimeToDigits(text: string): string {
  let t = text;
  // "в половине восьмого", "полвосьмого"
  t = t.replace(re(`${B}(?:в\\s+)?(?:половине\\s+|пол)(${alt(ORDINALS_RU)})${E}`), (_m, w: string) => `в ${pm(lookup(ORDINALS_RU, w)! - 1 || 12)}:30`);
  // Kazakh after a time word: "кешкі жеті", "сағат сегізде", "түскі екіде"
  t = t.replace(re(`${B}(кешкі|түскі|таңғы|сағат)\\s+(${alt(HOURS_KK)})(\\p{L}*)`), (_m, ctx: string, w: string, suffix: string) =>
    `${ctx} ${ctx.toLowerCase() === "таңғы" ? lookup(HOURS_KK, w) : pm(lookup(HOURS_KK, w)!)}${suffix}`
  );
  // Kazakh "<hour> жарым(да)" - half past
  t = t.replace(re(`${B}(${alt(HOURS_KK)}|\\d{1,2})(?:-?\\p{L}{0,3})?\\s+жарым\\p{L}*`), (_m, w: string) => `${pm(lookup(HOURS_KK, w) ?? Number(w))}:30`);
  // Kazakh hour with a dative/locative ending on its own ("жетіге келеміз");
  // only 5-9: smaller numbers with these endings are usually party sizes or
  // other words ("бірге" = together).
  t = t.replace(re(`${B}(бес|алты|жеті|сегіз|тоғыз)(ге|ке|ға|қа|де|те|да|та)${E}`), (_m, w: string, suffix: string) => `${pm(lookup(HOURS_KK, w)!)}${suffix}`);
  // Russian "в/к семь", "к семи", "на семь вечера" - not "на семь человек"
  t = t.replace(
    re(`${B}(в|к|около|на)\\s+(${alt(HOURS_RU)})${E}(?!\\s*(?:${PEOPLE}|двоих|троих))`),
    (m: string, prep: string, w: string, offset: number, whole: string) => {
      // "на семь" is a time only when followed by вечера/часов/дня.
      const after = whole.slice(offset + m.length, offset + m.length + 12);
      if (prep.toLowerCase() === "на" && !/вечер|час|дня/i.test(after)) return m;
      return `${prep} ${pm(lookup(HOURS_RU, w)!)}`;
    }
  );
  return t;
}

function findTime(raw: string): string | null {
  const text = spokenTimeToDigits(raw);
  // "кешкі 7", "кешкі 7-ге", "7 вечера", "в 7 вечера" - evening.
  const evening =
    lastMatch(text, re(`${B}кешкі\\s*(\\d{1,2})(?:[:.](\\d{2}))?`)) ??
    lastMatch(text, re(`(?<![\\d])(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:-?\\p{L}{0,3}\\s*)?(?:час\\p{L}*\\s*)?вечер`));
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
    lastMatch(text, re(`${B}(?:сағат|в|к|около)\\s+(\\d{1,2})(?!\\d)${E}(?!\\s*(?:${PEOPLE}|числ|\\.|/))`)) ??
    lastMatch(text, re(`(?<![\\d])(\\d{1,2})-?(?:ге|де|ке|те|ға|да|қа|та)${E}`));
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

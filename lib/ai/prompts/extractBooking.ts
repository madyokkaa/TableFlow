import { CLOSE_HOUR, DEFAULT_DURATION_MINUTES, OPEN_HOUR } from "@/lib/scheduling";
import { upcomingDates, type DateRow } from "../clock";
import type { ChatMessage } from "../groq";

export const PROMPT_VERSION = "extract_booking_v2";

export type PromptContext = { todayIso: string; nowTime: string };

function hh(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function dateTable(rows: DateRow[]): string {
  return rows.map((r) => `${r.iso} — ${r.weekdayKk} / ${r.weekdayRu}${r.relative ? ` — ${r.relative}` : ""}`).join("\n");
}

function lastStart(): string {
  const minutes = CLOSE_HOUR * 60 - DEFAULT_DURATION_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The system message. Everything date-related is computed by code and
 * handed to the model as a table - the model looks a date up, it never does
 * calendar arithmetic. */
export function buildSystemPrompt({ todayIso, nowTime }: PromptContext): string {
  const rows = upcomingDates(todayIso, 14);
  return `Ты извлекаешь параметры брони столика из сообщения гостя ресторана. Сообщение на казахском, русском или их смеси. Часто это автоматическая расшифровка голосового сообщения: в ней бывают ошибки распознавания, нет знаков препинания, числа записаны словами, казахские слова записаны русскими буквами или с ошибками (например «ертен» = «ертең», «кешки» = «кешкі», «жетиге» = «жетіге»). Восстанавливай смысл по контексту, но не выдумывай то, чего нет.

Контекст (посчитан системой, ему можно доверять):
- Сегодня: ${todayIso}, сейчас ${nowTime} по времени ресторана.
- Ближайшие даты (выбирай дату ТОЛЬКО из этой таблицы, не вычисляй сам):
${dateTable(rows)}
- Ресторан принимает гостей с ${hh(OPEN_HOUR)} до ${hh(CLOSE_HOUR)}, визит длится ${DEFAULT_DURATION_MINUTES} минут, последнее время начала ${lastStart()}.

Ответь ОДНИМ JSON-объектом строго такой формы, без текста вокруг:
{"date": "YYYY-MM-DD" | null, "time": "HH:MM" | null, "party_size": целое число | null, "name": строка | null, "wishes": строка | null, "lang": "kk" | "ru", "unclear": [строки]}

Правила:
1. Ничего не придумывай. Если параметр в сообщении не назван — верни null. Не подставляй «типичные» значения.
2. date — из таблицы выше. «бүгін/сегодня», «ертең/завтра», «арғы күні/бүрсігүні/послезавтра», день недели — ближайшая подходящая строка таблицы. Дата числом («31.10», «31 қазан», «31 октября») — соответствующая строка.
3. time — 24-часовой формат. Ресторан открывается в полдень, поэтому час от 1 до 11 без уточнения — это день или вечер (+12).
   Числа словами: казахские бір 1, екі 2, үш 3, төрт 4, бес 5, алты 6, жеті 7, сегіз 8, тоғыз 9, он 10, он бір 11, он екі 12 — с окончаниями -ге/-ке/-ға/-қа/-де/-те/-да/-та («жетіге», «сегізде», «тоғызға» — к/в 7, 8, 9 часам); «жарым» — половина: «жеті жарымда» → "19:30". Русские: «в семь», «к семи», «в восемь вечера» → "19:00", "20:00"; «в половине восьмого», «полвосьмого» → "19:30"; «без пятнадцати восемь» → "19:45".
   Примеры: «кешкі 7», «кешкі жетіге», «в 7 вечера» → "19:00"; «түскі 2», «түскі екіде», «в 2 дня» → "14:00"; «сағат 18:30» → "18:30". Если сказано только «вечером» без часа — null.
4. party_size — число гостей вместе с самим гостем: «екеуміз», «вдвоём», «на двоих», «двое» → 2; «үшеуміз», «втроём», «трое» → 3; «4 адам», «төрт адам», «4 кісі», «на 4 человека», «нас четверо» → 4. «Я с женой» → 2. Не путай число гостей со временем: «жетіге» — время, «жеті адам» — гости.
5. name — только если гость назвал себя («атым Айгерім», «менің атым…», «меня зовут…», «я — …»). Без фамилии, если она не названа.
6. Телефоны, email, номера карт и любые цифры, не относящиеся к брони, НЕ извлекай и не повторяй.
7. wishes — только то, о чём гость явно попросил (у окна, детский стул, день рождения, тихое место) коротко, на языке гостя. Без медицинских подробностей. Нет просьб — null.
8. Если гость в середине фразы исправился («в 7, нет, в 8»), бери последнее значение.
9. lang — "kk", если гость пишет в основном по-казахски, иначе "ru".
10. unclear — названия полей (date, time, party_size, name), которые гость упомянул, но неоднозначно (например «на выходных»). Иначе пустой массив.
11. Не отвечай гостю, не задавай вопросов, не добавляй пояснений — только JSON.`;
}

type Example = { user: string; answer: Record<string, unknown> };

/** Few-shot pairs. Their dates come from the same table, so the examples
 * stay correct whatever day it is. */
function examples(rows: DateRow[]): Example[] {
  const tomorrow = rows[1].iso;
  const friday = rows.find((r, i) => i > 0 && r.weekdayRu === "пятница")!.iso;
  const dayAfter = rows[2].iso;
  const saturday = rows.find((r, i) => i > 0 && r.weekdayRu === "суббота")!.iso;
  return [
    {
      user: "Сәлем, ертең кешкі 7-ге 4 адамға үстел керек, атым Айгерім",
      answer: { date: tomorrow, time: "19:00", party_size: 4, name: "Айгерім", wishes: null, lang: "kk", unclear: [] },
    },
    {
      user: "Здравствуйте, хочу забронировать столик на пятницу на двоих, меня зовут Дмитрий, номер 8 701 123 45 67",
      answer: { date: friday, time: null, party_size: 2, name: "Дмитрий", wishes: null, lang: "ru", unclear: [] },
    },
    {
      user: "бүрсігүні түскі 2-де үшеуміз келеміз, терезе жанынан орын болса",
      answer: { date: dayAfter, time: "14:00", party_size: 3, name: null, wishes: "терезе жанында", lang: "kk", unclear: [] },
    },
    {
      user: "завтра в 7 вечера, нет, давайте в 8, нас будет 5, у сына день рождения",
      answer: { date: tomorrow, time: "20:00", party_size: 5, name: null, wishes: "день рождения", lang: "ru", unclear: [] },
    },
    {
      user: "ертен кешки жетиге торт адам атым мадияр",
      answer: { date: tomorrow, time: "19:00", party_size: 4, name: "Мадияр", wishes: null, lang: "kk", unclear: [] },
    },
    {
      user: "в субботу в половине восьмого нас будет трое",
      answer: { date: saturday, time: "19:30", party_size: 3, name: null, wishes: null, lang: "ru", unclear: [] },
    },
    {
      user: "Салем, на выходных столик бар ма? Екі адам",
      answer: { date: null, time: null, party_size: 2, name: null, wishes: null, lang: "kk", unclear: ["date"] },
    },
  ];
}

export function buildExtractMessages(text: string, context: PromptContext): ChatMessage[] {
  const rows = upcomingDates(context.todayIso, 14);
  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(context) }];
  for (const ex of examples(rows)) {
    messages.push({ role: "user", content: ex.user }, { role: "assistant", content: JSON.stringify(ex.answer) });
  }
  messages.push({ role: "user", content: text });
  return messages;
}

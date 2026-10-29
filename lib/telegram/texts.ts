import { formatDateWords } from "@/lib/ai/clock";
import type { FieldName, ProblemCode } from "@/lib/ai/bookingFields";

export type Lang = "kk" | "ru";

/** Kazakh for language_code "kk", Russian otherwise. */
export function langFromCode(code: string | undefined | null): Lang {
  return code?.toLowerCase().startsWith("kk") ? "kk" : "ru";
}

function partyKk(n: number): string {
  return `${n} адам`;
}

function partyRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "гость" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "гостя" : "гостей";
  return `${n} ${word}`;
}

export type Summary = { date: string; time: string; partySize: number; name: string; wishes: string | null };

const QUESTIONS: Record<Lang, Record<FieldName, string>> = {
  kk: { date: "Қай күнге?", time: "Қай уақытқа?", partySize: "Қанша адам боласыздар?", name: "Атыңыз кім?" },
  ru: { date: "На какой день?", time: "На какое время?", partySize: "Сколько вас будет?", name: "Как вас зовут?" },
};

const PROBLEMS: Record<Lang, Record<ProblemCode, string>> = {
  kk: {
    date_invalid: "Күнді түсінбедім.",
    date_in_past: "Бұл күн өтіп кетті.",
    date_too_far: "Бұл күнге әлі брондау ашылмаған.",
    time_invalid: "Уақытты түсінбедім.",
    outside_hours: "Бұл уақытта мейрамхана жұмыс істемейді.",
    time_in_past: "Бұл уақыт өтіп кетті.",
    party_invalid: "Адам санын түсінбедім.",
    party_too_large: "Мұндай үлкен топқа мейрамханаға хабарласыңыз.",
    name_invalid: "Атыңыз тым ұзын.",
  },
  ru: {
    date_invalid: "Не понял дату.",
    date_in_past: "Эта дата уже прошла.",
    date_too_far: "На эту дату бронирование ещё не открыто.",
    time_invalid: "Не понял время.",
    outside_hours: "В это время ресторан не работает.",
    time_in_past: "Это время уже прошло.",
    party_invalid: "Не понял, сколько вас будет.",
    party_too_large: "Для такой большой компании свяжитесь с рестораном.",
    name_invalid: "Имя слишком длинное.",
  },
};

export const texts = {
  /** Shown on /start and before consent - in both languages, since we don't
   * know yet which one the guest prefers. */
  welcome(siteUrl: string | null, restaurantName: string | null): string {
    const privacy = siteUrl ? `${siteUrl}/privacy` : null;
    const kk = [
      restaurantName ? `Сәлеметсіз бе! «${restaurantName}» үстел брондау боты.` : "Сәлеметсіз бе! Бұл — үстел брондау боты.",
      "🎤 Дауыстық хабарлама жіберіңіз немесе жазыңыз: күні, уақыты, қанша адам және атыңыз.",
      "Хабарламаларды ЖИ өңдейді, брондауды әкімші растайды. Мәтін мен дауыс тану үшін Groq сервисіне жіберіледі.",
      privacy ? `Толығырақ: ${privacy}` : null,
    ];
    const ru = [
      restaurantName ? `Здравствуйте! Это бот бронирования столиков «${restaurantName}».` : "Здравствуйте! Это бот бронирования столиков.",
      "🎤 Отправьте голосовое или напишите: дату, время, сколько вас будет и как вас зовут.",
      "Сообщения обрабатывает ИИ, бронь подтверждает администратор. Текст и голос передаются сервису Groq для распознавания.",
      privacy ? `Подробнее: ${privacy}` : null,
    ];
    return [...kk.filter(Boolean), "", ...ru.filter(Boolean), "", "Келісесіз бе? / Вы согласны?"].join("\n");
  },
  consentButton: "✅ Келісемін / Согласен",
  consentFirst: "Алдымен келісіміңізді растаңыз. / Сначала подтвердите согласие.",

  askBooking: {
    kk: "Жазыңыз немесе айтыңыз: қай күнге, қай уақытқа, қанша адам және атыңыз.",
    ru: "Напишите или скажите: на какой день, во сколько, сколько вас и как вас зовут.",
  } satisfies Record<Lang, string>,

  question(lang: Lang, missing: FieldName[], problems: { code: ProblemCode }[]): string {
    const reasons = problems.map((p) => PROBLEMS[lang][p.code]);
    const questions = missing.map((f) => QUESTIONS[lang][f]);
    return [...reasons, ...questions].join(" ");
  },

  /** "31 қазан, жұма, 19:00, 4 адам, Айгерім. Тілек: …" */
  details(lang: Lang, s: Summary): string {
    const date = formatDateWords(s.date, lang);
    if (lang === "kk") {
      return `${date}, ${s.time}, ${partyKk(s.partySize)}, ${s.name}.${s.wishes ? ` Тілек: ${s.wishes}.` : ""}`;
    }
    return `${date}, ${s.time}, ${partyRu(s.partySize)}, ${s.name}.${s.wishes ? ` Пожелание: ${s.wishes}.` : ""}`;
  },
  summary(lang: Lang, s: Summary): string {
    return `${texts.details(lang, s)} ${lang === "kk" ? "Дұрыс па?" : "Всё верно?"}`;
  },
  confirmButton: "✅ Иә / Да",
  editButton: "✏️ Өзгерту / Изменить",
  abortButton: "✖️ Бас тарту / Отмена",

  whatToChange: {
    kk: "Жазыңыз немесе айтыңыз, нені өзгерту керек.",
    ru: "Напишите или скажите, что изменить.",
  } satisfies Record<Lang, string>,
  aborted: { kk: "Жарайды, брондау тоқтатылды.", ru: "Хорошо, бронирование отменено." } satisfies Record<Lang, string>,
  stale: { kk: "Бұл батырма ескірген.", ru: "Эта кнопка уже неактуальна." } satisfies Record<Lang, string>,

  askContact: {
    kk: "Әкімші сізбен байланыса алуы үшін нөміріңізбен бөлісіңіз.",
    ru: "Поделитесь номером, чтобы администратор мог с вами связаться.",
  } satisfies Record<Lang, string>,
  contactButton: "📱 Нөмірмен бөлісу / Поделиться номером",
  useContactButton: {
    kk: "Төмендегі батырма арқылы өз нөміріңізбен бөлісіңіз.",
    ru: "Поделитесь своим номером кнопкой ниже.",
  } satisfies Record<Lang, string>,

  noTableAt(lang: Lang, time: string, alternatives: string[]): string {
    if (lang === "kk") {
      return alternatives.length
        ? `${time}-де бос үстел жоқ. Басқа уақытты таңдаңыз:`
        : `${time}-де және осы күні бос үстел жоқ. Басқа күнді жазыңыз.`;
    }
    return alternatives.length
      ? `На ${time} свободных столов нет. Выберите другое время:`
      : `На ${time} и в этот день свободных столов нет. Напишите другой день.`;
  },
  justTaken: {
    kk: "Бұл үстелді жаңа ғана біреу алып қойды.",
    ru: "Этот стол только что заняли.",
  } satisfies Record<Lang, string>,

  accepted: {
    kk: "Өтінім қабылданды ✅ Әкімші растаған соң хабарлаймын.",
    ru: "Заявка принята ✅ Сообщу, когда администратор подтвердит.",
  } satisfies Record<Lang, string>,
  cancelBookingButton: "Бас тарту / Отменить бронь",
  guestCancelled: { kk: "Брондау жойылды.", ru: "Бронь отменена." } satisfies Record<Lang, string>,
  cannotCancel: {
    kk: "Бұл брондауды енді жою мүмкін емес. Мейрамханаға хабарласыңыз.",
    ru: "Эту бронь уже нельзя отменить. Свяжитесь с рестораном.",
  } satisfies Record<Lang, string>,

  gaveUp(lang: Lang, siteUrl: string | null): string {
    const link = siteUrl ? ` ${siteUrl}` : "";
    return lang === "kk"
      ? `Кешіріңіз, түсіне алмадым. Сайтта брондаңыз:${link}`
      : `Извините, не удалось понять. Забронируйте на сайте:${link}`;
  },
  aiDisabled(siteUrl: string | null): string {
    const link = siteUrl ? `\n${siteUrl}` : "";
    return `Бот арқылы брондау уақытша қолжетімсіз, сайтта брондаңыз.\nБронирование через бот временно недоступно, забронируйте на сайте.${link}`;
  },
  voiceTooLong: {
    kk: "Дауыстық хабарлама тым ұзын. Қысқарақ айтыңыз (1 минутқа дейін) немесе жазыңыз.",
    ru: "Голосовое слишком длинное. Скажите короче (до минуты) или напишите текстом.",
  } satisfies Record<Lang, string>,
  voiceFailed(lang: Lang, siteUrl: string | null): string {
    const link = siteUrl ? ` ${siteUrl}` : "";
    return lang === "kk"
      ? `Дауысты тану мүмкін болмады. Мәтінмен жазыңыз немесе сайтта брондаңыз:${link}`
      : `Не удалось распознать голос. Напишите текстом или забронируйте на сайте:${link}`;
  },
  tooManyMessages: "Хабарлама тым көп, біраз күте тұрыңыз. / Слишком много сообщений, подождите немного.",
  unsupported: {
    kk: "Мәтін немесе дауыстық хабарлама жіберіңіз.",
    ru: "Пришлите текст или голосовое сообщение.",
  } satisfies Record<Lang, string>,
  error: {
    kk: "Қате шықты, кейінірек қайталап көріңіз.",
    ru: "Что-то пошло не так, попробуйте позже.",
  } satisfies Record<Lang, string>,

  // Sent from the staff side (lib/telegram/notify.ts).
  confirmed(lang: Lang, date: string, time: string, hall: string | null): string {
    const when = `${formatDateWords(date, lang)}, ${time}`;
    return lang === "kk"
      ? `Брондау расталды ✅\n${when}${hall ? `, ${hall}` : ""}. Күтеміз!`
      : `Бронь подтверждена ✅\n${when}${hall ? `, ${hall}` : ""}. Ждём вас!`;
  },
  cancelledByRestaurant(lang: Lang, reason: string | null): string {
    return lang === "kk"
      ? `Өкінішке қарай, мейрамхана брондауды жойды.${reason ? ` Себебі: ${reason}` : ""}`
      : `К сожалению, ресторан отменил бронь.${reason ? ` Причина: ${reason}` : ""}`;
  },
  rescheduled(lang: Lang, date: string, time: string, hall: string | null): string {
    const when = `${formatDateWords(date, lang)}, ${time}`;
    return lang === "kk"
      ? `Брондау өзгертілді: ${when}${hall ? `, ${hall}` : ""}.`
      : `Бронь изменена: ${when}${hall ? `, ${hall}` : ""}.`;
  },
  reminder(lang: Lang, time: string): string {
    return lang === "kk" ? `Еске салу: бүгін ${time}-де сізді күтеміз.` : `Напоминаем: ждём вас сегодня в ${time}.`;
  },
};

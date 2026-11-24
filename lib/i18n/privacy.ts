import type { Lang } from "./config";
import type { PluralForms } from "./messages";

/** The /privacy page in each language. The facts are the same in all three
 * and describe what the code does - change them together. */
export type PrivacyCopy = {
  back: string;
  title: string;
  lead: string;
  operator: string;
  days: PluralForms;
  stored: {
    title: string;
    intro: string;
    items: [term: string, text: string][];
    account: string;
    ip: string;
  };
  why: { title: string; text: string };
  access: { title: string; staff: string; journal: string };
  retention: { title: string; text: (retention: string) => string };
  erase: { title: string; how: string; upcoming: string; notAccount: string; contact: string };
};

const ru: PrivacyCopy = {
  back: "К бронированию",
  title: "Персональные данные",
  lead: "Что сохраняется, когда вы бронируете стол, зачем, кто это видит и как это удалить.",
  operator: "Оператор персональных данных:",
  days: { one: "день", few: "дня", many: "дней", other: "дня" },
  stored: {
    title: "Какие данные сохраняются",
    intro: "При бронировании в базе данных сохраняется запись о брони:",
    items: [
      ["Имя", "как вы его указали в форме;"],
      ["Телефон и/или email", "хотя бы одно из двух, чтобы с вами можно было связаться;"],
      ["Бронь", "число гостей, дата, время и продолжительность визита, выбранный стол;"],
      ["Статус брони", "ожидает, подтверждена, завершена, отменена или неявка;"],
      ["Причина отмены", "если бронь отменили, и кто её отменил — вы или ресторан;"],
      ["Момент согласия", "дата и время, когда вы отметили согласие на обработку данных."],
    ],
    account:
      "Аккаунт не обязателен. Если вы бронируете, войдя в аккаунт, бронь привязывается к нему, а имя и телефон из формы сохраняются в профиле аккаунта, чтобы подставить их в следующий раз.",
    ip: "Чтобы ограничить частоту запросов к бронированию, сервер считает обращения с одного IP-адреса. Сам адрес не хранится — только его необратимый хэш, и не дольше суток.",
  },
  why: {
    title: "Зачем",
    text: "Только для обработки брони: чтобы держать за вами стол, подтвердить или отменить бронь и связаться с вами по ней.",
  },
  access: {
    title: "Кто имеет доступ",
    staff:
      "Сотрудники ресторана, которым выдан доступ к панели персонала (роль «персонал»): они видят список броней с именем и контактами, чтобы встречать гостей и связываться с ними. Если вы вошли в аккаунт, свои брони видите и вы.",
    journal: "В журнал действий персонала попадают только номера броней и названия изменённых полей — без имени, телефона и email.",
  },
  retention: {
    title: "Сколько хранятся",
    text: (retention) =>
      `Бронь, время которой прошло, автоматически закрывается. Закрытые брони — завершённые, отменённые и неявки — удаляются, когда с даты визита прошло больше ${retention}.`,
  },
  erase: {
    title: "Как удалить свои данные",
    how: "Укажите email или телефон, с которым бронировали. Во всех завершённых, отменённых и уже прошедших бронях с этим контактом имя заменится на «Удалено по запросу гостя», телефон и email сотрутся, бронь отвяжется от аккаунта. Дата, время и число гостей останутся без связи с вами.",
    upcoming:
      "Предстоящие брони так не удаляются, чтобы никто не мог снять чужую бронь: сначала отмените её — в аккаунте или обратившись в ресторан.",
    notAccount: "Форма не удаляет аккаунт и сохранённые в его профиле имя и телефон.",
    contact: "По этому и другим вопросам о персональных данных:",
  },
};

const en: PrivacyCopy = {
  back: "Back to booking",
  title: "Personal data",
  lead: "What is stored when you book a table, why, who can see it and how to delete it.",
  operator: "Personal data controller:",
  days: { one: "day", other: "days" },
  stored: {
    title: "What is stored",
    intro: "When you book, a booking record is saved in the database:",
    items: [
      ["Name", "as you entered it in the form;"],
      ["Phone and/or email", "at least one of the two, so we can reach you;"],
      ["Booking", "number of guests, date, time and length of the visit, the chosen table;"],
      ["Booking status", "pending, confirmed, completed, cancelled or no-show;"],
      ["Cancellation reason", "if the booking was cancelled, and who cancelled it — you or the restaurant;"],
      ["Time of consent", "the date and time you ticked the consent to data processing."],
    ],
    account:
      "An account is optional. If you book while signed in, the booking is linked to your account, and the name and phone from the form are saved in your account profile to fill them in next time.",
    ip: "To limit how often booking requests can be made, the server counts requests from each IP address. The address itself is not stored — only its irreversible hash, and for no longer than a day.",
  },
  why: {
    title: "Why",
    text: "Only to handle your booking: to hold the table for you, confirm or cancel the booking and contact you about it.",
  },
  access: {
    title: "Who has access",
    staff:
      "Restaurant employees who have been given access to the staff panel (the “staff” role): they see the list of bookings with names and contacts to welcome guests and get in touch with them. If you are signed in, you can see your own bookings too.",
    journal: "The staff activity log records only booking numbers and the names of changed fields — no names, phone numbers or emails.",
  },
  retention: {
    title: "How long it is kept",
    text: (retention) =>
      `A booking whose time has passed is closed automatically. Closed bookings — completed, cancelled and no-shows — are deleted once more than ${retention} have passed since the visit date.`,
  },
  erase: {
    title: "How to delete your data",
    how: "Enter the email or phone you booked with. In all completed, cancelled and past bookings with this contact, the name will be replaced with “Deleted at the guest's request”, the phone and email will be erased, and the booking will be unlinked from any account. The date, time and number of guests remain, with no link to you.",
    upcoming:
      "Upcoming bookings are not deleted this way, so that no one can remove someone else's booking: cancel it first — in your account or by contacting the restaurant.",
    notAccount: "The form does not delete your account or the name and phone saved in its profile.",
    contact: "For this and other questions about personal data:",
  },
};

const kk: PrivacyCopy = {
  back: "Брондауға оралу",
  title: "Жеке деректер",
  lead: "Үстел брондағанда не сақталады, не үшін, оны кім көреді және қалай жоюға болады.",
  operator: "Жеке деректер операторы:",
  days: { one: "күн", other: "күн" },
  stored: {
    title: "Қандай деректер сақталады",
    intro: "Брондау кезінде дерекқорда бронь туралы жазба сақталады:",
    items: [
      ["Аты", "формада қалай көрсетсеңіз, солай;"],
      ["Телефон және/немесе email", "сізбен байланысу үшін екеуінің кемінде біреуі;"],
      ["Бронь", "қонақтар саны, келу күні, уақыты мен ұзақтығы, таңдалған үстел;"],
      ["Бронь мәртебесі", "күтуде, расталды, аяқталды, болдырылмады немесе келмеді;"],
      ["Болдырмау себебі", "бронь болдырылмаса, оны кім болдырмағаны — сіз бе, мейрамхана ма;"],
      ["Келісім уақыты", "деректерді өңдеуге келісім белгілеген күніңіз бен уақытыңыз."],
    ],
    account:
      "Аккаунт міндетті емес. Аккаунтқа кіріп брондасаңыз, бронь соған байланады, ал формадағы аты мен телефоны келесі жолы автоматты толтыру үшін аккаунт профилінде сақталады.",
    ip: "Брондау сұрауларының жиілігін шектеу үшін сервер бір IP-мекенжайдан келген сұрауларды санайды. Мекенжайдың өзі сақталмайды — тек оның қайтымсыз хэші, әрі бір тәуліктен аспайды.",
  },
  why: {
    title: "Не үшін",
    text: "Тек броньды өңдеу үшін: үстелді сізге сақтау, броньды растау не болдырмау және ол бойынша сізбен байланысу үшін.",
  },
  access: {
    title: "Кімнің қолжетімділігі бар",
    staff:
      "Персонал панеліне қолжетімділік берілген мейрамхана қызметкерлері («персонал» рөлі): қонақтарды қарсы алу және олармен байланысу үшін аты мен байланыс деректері бар броньдар тізімін көреді. Аккаунтқа кірсеңіз, өз броньдарыңызды сіз де көресіз.",
    journal: "Персонал әрекеттерінің журналына тек бронь нөмірлері мен өзгертілген өрістердің атаулары түседі — атысыз, телефонсыз және email-сіз.",
  },
  retention: {
    title: "Қанша уақыт сақталады",
    text: (retention) =>
      `Уақыты өтіп кеткен бронь автоматты түрде жабылады. Жабылған броньдар — аяқталған, болдырылмаған және келмегендер — келу күнінен бастап ${retention}нен астам уақыт өткенде жойылады.`,
  },
  erase: {
    title: "Деректерімді қалай жоюға болады",
    how: "Брондаған email-ді немесе телефонды көрсетіңіз. Осы байланыспен жасалған барлық аяқталған, болдырылмаған және өтіп кеткен броньдарда аты «Қонақтың сұрауы бойынша жойылды» деп ауыстырылады, телефон мен email өшіріледі, бронь аккаунттан ажыратылады. Күні, уақыты және қонақтар саны сізбен байланыссыз қалады.",
    upcoming:
      "Ешкім біреудің броньын алып тастай алмауы үшін алдағы броньдар бұлай жойылмайды: алдымен оны болдырмаңыз — аккаунтта немесе мейрамханаға хабарласып.",
    notAccount: "Форма аккаунтты және оның профилінде сақталған аты мен телефонды жоймайды.",
    contact: "Осы және жеке деректерге қатысты басқа сұрақтар бойынша:",
  },
};

export const PRIVACY: Record<Lang, PrivacyCopy> = { ru, en, kk };

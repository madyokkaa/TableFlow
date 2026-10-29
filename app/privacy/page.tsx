import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { STALE_RESERVATION_RETENTION_DAYS } from "@/lib/reservationCleanup";
import { pluralize } from "@/lib/ru";
import { EraseDataForm } from "@/components/guest/EraseDataForm";

export const metadata: Metadata = {
  title: "Персональные данные · TableFlow",
  description: "Какие данные собирает форма бронирования и как их удалить.",
};

// Everything below describes what this codebase actually collects and
// keeps. The operator's name and a contact for requests are deployment
// facts the code can't know - they come from the environment and their
// sections are simply left out when unset.
const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || null;
const PRIVACY_CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || null;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-normal tracking-[-0.01em] text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-muted text-pretty">{children}</div>
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li>
      <b className="font-semibold text-ink">{term}</b> — {children}
    </li>
  );
}

export default function PrivacyPage() {
  const retention = `${STALE_RESERVATION_RETENTION_DAYS} ${pluralize(STALE_RESERVATION_RETENTION_DAYS, "день", "дня", "дней")}`;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="gp-lamp" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-[760px] flex-col gap-8 px-6 pb-16 pt-7">
        <Link
          href="/"
          className="group inline-flex min-h-11 items-center gap-2 self-start text-[13px] text-[#c9b6ae] transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={2} aria-hidden="true" />
          К бронированию
        </Link>

        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs tracking-[0.28em] text-[#c9b6ae]">TABLEFLOW</p>
          <h1 className="text-balance font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl">
            Персональные данные
          </h1>
          <p className="text-pretty text-[15px] leading-relaxed text-muted">
            Что сохраняется, когда вы бронируете стол, зачем, кто это видит и как это удалить.
          </p>
          {OPERATOR_NAME && (
            <p className="text-[15px] text-muted">
              Оператор персональных данных: <b className="font-semibold text-ink">{OPERATOR_NAME}</b>
            </p>
          )}
        </header>

        <Section title="Какие данные сохраняются">
          <p>При бронировании в базе данных сохраняется запись о брони:</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <Item term="Имя">как вы его указали в форме;</Item>
            <Item term="Телефон и/или email">хотя бы одно из двух, чтобы с вами можно было связаться;</Item>
            <Item term="Бронь">число гостей, дата, время и продолжительность визита, выбранный стол;</Item>
            <Item term="Статус брони">ожидает, подтверждена, завершена, отменена или неявка;</Item>
            <Item term="Причина отмены">если бронь отменили, и кто её отменил — вы или ресторан;</Item>
            <Item term="Момент согласия">дата и время, когда вы отметили согласие на обработку данных.</Item>
          </ul>
          <p>
            Аккаунт не обязателен. Если вы бронируете, войдя в аккаунт, бронь привязывается к нему, а имя и телефон из
            формы сохраняются в профиле аккаунта, чтобы подставить их в следующий раз.
          </p>
          <p>
            Чтобы ограничить частоту запросов к бронированию, сервер считает обращения с одного IP-адреса. Сам адрес не
            хранится — только его необратимый хэш, и не дольше суток.
          </p>
        </Section>

        <Section title="Зачем">
          <p>
            Только для обработки брони: чтобы держать за вами стол, подтвердить или отменить бронь и связаться с вами
            по ней.
          </p>
        </Section>

        <Section title="Кто имеет доступ">
          <p>
            Сотрудники ресторана, которым выдан доступ к панели персонала (роль «персонал»): они видят список броней с
            именем и контактами, чтобы встречать гостей и связываться с ними. Если вы вошли в аккаунт, свои брони видите
            и вы.
          </p>
          <p>
            В журнал действий персонала попадают только номера броней и названия изменённых полей — без имени,
            телефона и email.
          </p>
        </Section>

        <Section title="Сколько хранятся">
          <p>
            Бронь, время которой прошло, автоматически закрывается. Закрытые брони — завершённые, отменённые и неявки —
            удаляются, когда с даты визита прошло больше {retention}.
          </p>
        </Section>

        <Section title="Как удалить свои данные">
          <p>
            Укажите email или телефон, с которым бронировали. Во всех завершённых, отменённых и уже прошедших бронях с
            этим контактом имя заменится на «Удалено по запросу гостя», телефон и email сотрутся, бронь отвяжется от
            аккаунта. Дата, время и число гостей останутся без связи с вами.
          </p>
          <p>
            Предстоящие брони так не удаляются, чтобы никто не мог снять чужую бронь: сначала отмените её — в аккаунте
            или обратившись в ресторан.
          </p>
          <EraseDataForm />
          <p>
            Форма не удаляет аккаунт и сохранённые в его профиле имя и телефон.
            {PRIVACY_CONTACT && (
              <>
                {" "}
                По этому и другим вопросам о персональных данных: <b className="font-semibold text-ink">{PRIVACY_CONTACT}</b>.
              </>
            )}
          </p>
        </Section>
      </main>
    </div>
  );
}

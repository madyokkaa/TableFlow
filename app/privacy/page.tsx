import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { STALE_RESERVATION_RETENTION_DAYS } from "@/lib/reservationCleanup";
import { getLang } from "@/lib/i18n/server";
import { PRIVACY } from "@/lib/i18n/privacy";
import { formatters } from "@/lib/i18n/format";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { EraseDataForm } from "@/components/guest/EraseDataForm";

export const metadata: Metadata = {
  title: "Персональные данные",
  description: "Какие данные собирает форма бронирования, кто их видит, сколько они хранятся и как их удалить.",
  alternates: { canonical: "/privacy" },
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

export default async function PrivacyPage() {
  const lang = await getLang();
  const t = PRIVACY[lang];
  const retention = formatters(lang).count(STALE_RESERVATION_RETENTION_DAYS, t.days);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="gp-lamp" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-[760px] flex-col gap-8 px-6 pb-16 pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="group inline-flex min-h-11 items-center gap-2 text-[13px] text-[#c9b6ae] transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={2} aria-hidden="true" />
            {t.back}
          </Link>
          <LanguageSwitcher />
        </div>

        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs tracking-[0.28em] text-[#c9b6ae]">TABLEFLOW</p>
          <h1 className="text-balance font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl">
            {t.title}
          </h1>
          <p className="text-pretty text-[15px] leading-relaxed text-muted">{t.lead}</p>
          {OPERATOR_NAME && (
            <p className="text-[15px] text-muted">
              {t.operator} <b className="font-semibold text-ink">{OPERATOR_NAME}</b>
            </p>
          )}
        </header>

        <Section title={t.stored.title}>
          <p>{t.stored.intro}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {t.stored.items.map(([term, text]) => (
              <Item key={term} term={term}>
                {text}
              </Item>
            ))}
          </ul>
          <p>{t.stored.account}</p>
          <p>{t.stored.ip}</p>
        </Section>

        <Section title={t.why.title}>
          <p>{t.why.text}</p>
        </Section>

        <Section title={t.access.title}>
          <p>{t.access.staff}</p>
          <p>{t.access.journal}</p>
        </Section>

        <Section title={t.retention.title}>
          <p>{t.retention.text(retention)}</p>
        </Section>

        <Section title={t.erase.title}>
          <p>{t.erase.how}</p>
          <p>{t.erase.upcoming}</p>
          <EraseDataForm />
          <p>
            {t.erase.notAccount}
            {PRIVACY_CONTACT && (
              <>
                {" "}
                {t.erase.contact} <b className="font-semibold text-ink">{PRIVACY_CONTACT}</b>.
              </>
            )}
          </p>
        </Section>
      </main>
    </div>
  );
}

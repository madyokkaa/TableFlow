import Image from "next/image";
import Link from "next/link";
import { BackgroundBlobs } from "@/components/guest/BackgroundBlobs";
import catImage from "@/public/404-cat.jpg";
import { getLang } from "@/lib/i18n/server";
import { MESSAGES } from "@/lib/i18n/messages";

export default async function NotFound() {
  const t = MESSAGES[await getLang()].notFound;
  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <BackgroundBlobs />
      <div className="overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-floating)]">
        <Image src={catImage} alt="" priority className="h-56 w-56 object-cover sm:h-64 sm:w-64" />
      </div>
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">{t.code}</p>
      <h1 className="mt-2 text-balance font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
        {t.title}
      </h1>
      <p className="mt-3 max-w-sm text-pretty text-muted">
        {t.text}
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-claret px-6 text-sm font-medium text-on-accent transition-[background-color,transform] duration-150 ease-out hover:bg-claret-strong active:scale-[0.98]"
      >
        {t.home}
      </Link>
    </main>
  );
}

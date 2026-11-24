/** The Telegram logo (blue circle, white paper plane), sized by the text. */
export function TelegramIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.4 11.8l11.6-4.5c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1 .5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.4-.1l-6.9 4.4-3-.9c-.6-.2-.7-.6.1-.9z"
      />
    </svg>
  );
}

/** Marks a booking that came in through the Telegram bot - its fields were
 * read by AI from the guest's message and are worth a second look. Same
 * pill shape as StatusPill. */
export function TelegramBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-claret-tint px-2.5 py-1 text-xs font-medium text-claret"
      title="Бронь создана ботом в Telegram по сообщению гостя"
    >
      <TelegramIcon />
      Telegram
    </span>
  );
}

/** The guest's own words (typed or transcribed) the bot booked from, so the
 * hostess can compare them with the fields before confirming. */
export function AiTranscript({ transcript }: { transcript: string }) {
  return (
    <details className="group rounded-[13px] border border-claret/25 bg-claret-tint/40 px-3 py-2 text-sm">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 font-semibold text-claret">
        <TelegramIcon className="h-4 w-4" />
        Распознано ИИ — проверьте
        <span className="ml-auto text-xs font-medium text-muted group-open:hidden">показать</span>
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words pb-1 text-ink/90">{transcript}</p>
    </details>
  );
}

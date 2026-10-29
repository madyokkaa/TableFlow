/** Marks a booking that came in through the Telegram bot - its fields were
 * read by AI from the guest's message and are worth a second look. Same
 * pill shape as StatusPill. */
export function TelegramBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-claret-tint px-2.5 py-1 text-xs font-medium text-claret"
      title="Бронь создана ботом в Telegram по сообщению гостя"
    >
      <span aria-hidden="true">🤖</span>
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
        <span aria-hidden="true">🤖</span>
        Распознано ИИ — проверьте
        <span className="ml-auto text-xs font-medium text-muted group-open:hidden">показать</span>
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words pb-1 text-ink/90">{transcript}</p>
    </details>
  );
}

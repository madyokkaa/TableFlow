import type { ExtractionResult } from "@/lib/ai/extractBooking";
import type { FieldName, Problem } from "@/lib/ai/bookingFields";
import { startHasPassed } from "@/lib/ai/bookingFields";
import { restaurantClock, type RestaurantClock } from "@/lib/ai/clock";
import type { Transcription } from "@/lib/ai/groq";
import { formatPhoneInput } from "@/lib/phone";
import {
  contactKeyboard,
  inlineKeyboard,
  REMOVE_KEYBOARD,
  MAX_VOICE_BYTES,
  type InlineKeyboard,
  type ReplyMarkup,
} from "@/lib/telegram";
import { freshSession, MAX_TRANSCRIPT_LENGTH, type Draft, type Session, type SessionStore } from "./session";
import type { BookingStore } from "./store";
import { langFromCode, texts, type Lang } from "./texts";

// The bot's dialogue. Stateless between updates: everything it knows about
// a conversation lives in telegram_sessions. The AI only turns speech into
// text and text into fields; every decision after that - validation, table
// choice, booking - is ordinary code.

export const MAX_CLARIFY_ROUNDS = 3;
export const MAX_VOICE_SECONDS = 60;

// --- Telegram update shapes (only the fields the bot reads) ---------------

type Chat = { id: number; type: string };
type User = { id: number; language_code?: string };
export type TgMessage = {
  message_id: number;
  chat: Chat;
  from?: User;
  text?: string;
  voice?: { file_id: string; duration: number; file_size?: number };
  audio?: { file_id: string; duration: number; file_size?: number };
  contact?: { phone_number: string; user_id?: number };
};
export type TgCallbackQuery = { id: string; from: User; data?: string; message?: { message_id: number; chat: Chat } };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery };

// --- Dependencies ----------------------------------------------------------

export type BotTelegram = {
  sendMessage(chatId: number, text: string, markup?: ReplyMarkup): Promise<number | null>;
  editMessageText(chatId: number, messageId: number, text: string, markup?: InlineKeyboard): Promise<boolean>;
  answerCallbackQuery(id: string, text?: string): Promise<void>;
  getFileBlob(fileId: string): Promise<{ blob: Blob; filename: string }>;
};

export type BotDeps = {
  telegram: BotTelegram;
  sessions: SessionStore;
  bookings: BookingStore;
  extract(text: string, now: Date): Promise<ExtractionResult>;
  transcribe(audio: Blob, filename: string): Promise<Transcription>;
  /** "allowed" | "limited" (first time over the limit) | "silent" (still over). */
  rateLimit(chatId: number): Promise<"allowed" | "limited" | "silent">;
  now(): Date;
  clock(now: Date): RestaurantClock;
  config: { aiEnabled: boolean; siteUrl: string | null; restaurantName: string | null };
};

export const defaultClock = (now: Date) => restaurantClock(now);

// --- Helpers -----------------------------------------------------------------

const REQUIRED: FieldName[] = ["date", "time", "partySize", "name"];

function missingFields(d: Draft): FieldName[] {
  return REQUIRED.filter((f) => d[f] === null || d[f] === undefined);
}

function confirmKeyboard(): InlineKeyboard {
  return inlineKeyboard([
    [{ text: texts.confirmButton, callback_data: "confirm" }],
    [
      { text: texts.editButton, callback_data: "edit" },
      { text: texts.abortButton, callback_data: "abort" },
    ],
  ]);
}

function timesKeyboard(times: string[]): InlineKeyboard {
  return inlineKeyboard([
    times.map((t) => ({ text: t, callback_data: `time:${t}` })),
    [{ text: texts.abortButton, callback_data: "abort" }],
  ]);
}

function appendTranscript(previous: string | undefined, text: string): string {
  const joined = previous ? `${previous}\n${text}` : text;
  return joined.length > MAX_TRANSCRIPT_LENGTH ? joined.slice(joined.length - MAX_TRANSCRIPT_LENGTH) : joined;
}

function resetDialog(session: Session): Session {
  return freshSession(session.chatId, session.lang, session.consentAt);
}

// --- Entry point -----------------------------------------------------------------

/** Handles one Telegram update end to end. Never throws: on an unexpected
 * failure the guest gets a short apology and the error is logged by code. */
export async function handleUpdate(update: TgUpdate, deps: BotDeps): Promise<void> {
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (!chat || chat.type !== "private") return; // groups and channels are ignored
  const from = update.message?.from ?? update.callback_query?.from;
  const now = deps.now();
  let lang: Lang = langFromCode(from?.language_code);

  try {
    if (update.message) {
      const verdict = await deps.rateLimit(chat.id);
      if (verdict === "limited") await deps.telegram.sendMessage(chat.id, texts.tooManyMessages);
      if (verdict !== "allowed") return;
    }

    const session = await deps.sessions.load(chat.id, lang, now);
    lang = session.lang;
    const next = update.callback_query
      ? await onCallback(update.callback_query, session, deps, now)
      : await onMessage(update.message!, session, deps, now);
    if (next) await deps.sessions.save(next, now);
  } catch (err) {
    console.error("[telegram.bot] update failed", { updateId: update.update_id, name: (err as Error)?.name });
    await deps.telegram.sendMessage(chat.id, texts.error[lang]);
  }
}

// --- Messages ----------------------------------------------------------------

async function onMessage(msg: TgMessage, session: Session, deps: BotDeps, now: Date): Promise<Session | null> {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (text === "/start") {
    const fresh = resetDialog(session);
    if (fresh.consentAt) {
      await deps.telegram.sendMessage(chatId, texts.askBooking[fresh.lang]);
      return fresh;
    }
    return askConsent(fresh, deps);
  }
  if (text === "/cancel") {
    await deps.telegram.sendMessage(chatId, texts.aborted[session.lang], REMOVE_KEYBOARD);
    return resetDialog(session);
  }

  if (!deps.config.aiEnabled) {
    await deps.telegram.sendMessage(chatId, texts.aiDisabled(deps.config.siteUrl), REMOVE_KEYBOARD);
    return resetDialog(session);
  }

  if (msg.contact) return onContact(msg, session, deps, now);

  const voice = msg.voice ?? msg.audio;
  if (!text && !voice) {
    await deps.telegram.sendMessage(chatId, texts.unsupported[session.lang]);
    return null;
  }

  // No booking before consent: remember the message and ask first.
  if (!session.consentAt) {
    const draft: Draft = voice
      ? { pendingVoice: { fileId: voice.file_id, duration: voice.duration, fileSize: voice.file_size ?? null } }
      : { pendingText: text };
    return askConsent({ ...session, draft }, deps);
  }

  if (session.state === "awaiting_contact" && text) {
    await deps.telegram.sendMessage(chatId, texts.useContactButton[session.lang], contactKeyboard(texts.contactButton));
    return null;
  }

  if (voice) return onVoice({ fileId: voice.file_id, duration: voice.duration, fileSize: voice.file_size ?? null }, session, deps, now);
  return onText(text!, session, deps, now, []);
}

async function askConsent(session: Session, deps: BotDeps): Promise<Session> {
  await deps.telegram.sendMessage(
    session.chatId,
    texts.welcome(deps.config.siteUrl, deps.config.restaurantName),
    inlineKeyboard([[{ text: texts.consentButton, callback_data: "consent" }]])
  );
  return { ...session, state: "awaiting_consent" };
}

async function onVoice(
  voice: { fileId: string; duration: number; fileSize: number | null },
  session: Session,
  deps: BotDeps,
  now: Date
): Promise<Session | null> {
  const chatId = session.chatId;
  if (voice.duration > MAX_VOICE_SECONDS || (voice.fileSize ?? 0) > MAX_VOICE_BYTES) {
    await deps.telegram.sendMessage(chatId, texts.voiceTooLong[session.lang]);
    return session;
  }
  let transcription: Transcription;
  try {
    const { blob, filename } = await deps.telegram.getFileBlob(voice.fileId);
    transcription = await deps.transcribe(blob, filename);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "unknown";
    console.error("[telegram.bot] voice failed", { code });
    await deps.telegram.sendMessage(
      chatId,
      code === "tg_file_too_large" ? texts.voiceTooLong[session.lang] : texts.voiceFailed(session.lang, deps.config.siteUrl)
    );
    return session;
  }
  if (!transcription.text) {
    await deps.telegram.sendMessage(chatId, texts.voiceFailed(session.lang, deps.config.siteUrl));
    return session;
  }
  return onText(transcription.text, session, deps, now, transcription.aiRequestId ? [transcription.aiRequestId] : [], true);
}

/** Text (typed or transcribed) → fields → merged into the draft → either
 * a precise question, or the summary to confirm. */
async function onText(
  text: string,
  session: Session,
  deps: BotDeps,
  now: Date,
  aiIds: number[],
  fromVoice = false
): Promise<Session | null> {
  const chatId = session.chatId;
  // For a voice message, show what was heard - a recognition slip is then
  // obvious to the guest before anything is booked.
  const heard = fromVoice ? texts.heard(text) : "";
  const result = await deps.extract(text, now);
  const lang: Lang = result.lang ?? session.lang;
  const draft: Draft = {
    ...session.draft,
    transcript: appendTranscript(session.draft.transcript, text),
    aiRequestIds: [...(session.draft.aiRequestIds ?? []), ...aiIds, ...(result.aiRequestId ? [result.aiRequestId] : [])],
    offeredTimes: undefined,
    pendingText: undefined,
    pendingVoice: undefined,
  };

  // A new message refines the draft: named fields replace, unnamed ones stay.
  const f = result.fields;
  if (f.date) draft.date = f.date;
  if (f.time) draft.time = f.time;
  if (f.partySize) draft.partySize = f.partySize;
  if (f.name) draft.name = f.name;
  if (f.wishes) draft.wishes = f.wishes;
  // A value the guest just gave but that failed the checks replaces the old
  // one too - it's what they want now, so ask about it again.
  const problems: Problem[] = [...result.problems];
  for (const p of problems) draft[p.field] = null;

  // Date and time can arrive in different messages; recheck them together.
  const clock = deps.clock(now);
  if (draft.date && draft.time && startHasPassed(draft.date, draft.time, clock)) {
    draft.time = null;
    problems.push({ field: "time", code: "time_in_past" });
  }

  const nothingUnderstood =
    result.degraded && !f.date && !f.time && !f.partySize && !f.name && problems.length === 0 && missingFields(session.draft).length === REQUIRED.length;
  const missing = missingFields(draft);

  if (missing.length === 0 && problems.length === 0) {
    await deps.telegram.sendMessage(
      chatId,
      heard + texts.summary(lang, { date: draft.date!, time: draft.time!, partySize: draft.partySize!, name: draft.name!, wishes: draft.wishes ?? null }),
      confirmKeyboard()
    );
    return { ...session, lang, draft, state: "awaiting_confirm", clarifyRounds: 0 };
  }

  const rounds = session.clarifyRounds + 1;
  if (rounds > MAX_CLARIFY_ROUNDS || nothingUnderstood) {
    // Either we keep missing, or the AI is down and the rules found nothing:
    // be honest and point to the website instead of looping.
    await deps.telegram.sendMessage(chatId, heard + texts.gaveUp(lang, deps.config.siteUrl), REMOVE_KEYBOARD);
    return resetDialog({ ...session, lang });
  }
  await deps.telegram.sendMessage(chatId, heard + texts.question(lang, missing, problems));
  return { ...session, lang, draft, state: "clarifying", clarifyRounds: rounds };
}

async function onContact(msg: TgMessage, session: Session, deps: BotDeps, now: Date): Promise<Session | null> {
  const chatId = msg.chat.id;
  // Only the guest's own number, shared with the button - not a forwarded card.
  if (!msg.contact || !msg.from || msg.contact.user_id !== msg.from.id) {
    await deps.telegram.sendMessage(chatId, texts.useContactButton[session.lang], contactKeyboard(texts.contactButton));
    return null;
  }
  if (session.state !== "awaiting_contact") {
    await deps.telegram.sendMessage(chatId, texts.askBooking[session.lang], REMOVE_KEYBOARD);
    return null;
  }
  const phone = formatPhoneInput(msg.contact.phone_number);
  return book({ ...session, draft: { ...session.draft, phone } }, deps, now);
}

// --- Buttons -------------------------------------------------------------------

async function onCallback(cq: TgCallbackQuery, session: Session, deps: BotDeps, now: Date): Promise<Session | null> {
  const chatId = cq.message!.chat.id;
  const data = cq.data ?? "";
  await deps.telegram.answerCallbackQuery(cq.id);

  if (data === "consent") {
    const consented: Session = { ...session, consentAt: session.consentAt ?? now.toISOString(), state: "idle" };
    if (cq.message) await deps.telegram.editMessageText(chatId, cq.message.message_id, texts.welcome(deps.config.siteUrl, deps.config.restaurantName));
    const { pendingText, pendingVoice } = session.draft;
    const cleared = { ...consented, draft: {} };
    if (!deps.config.aiEnabled) {
      await deps.telegram.sendMessage(chatId, texts.aiDisabled(deps.config.siteUrl));
      return cleared;
    }
    if (pendingVoice) return onVoice(pendingVoice, cleared, deps, now);
    if (pendingText) return onText(pendingText, cleared, deps, now, []);
    await deps.telegram.sendMessage(chatId, texts.askBooking[session.lang]);
    return cleared;
  }

  if (data.startsWith("cancel:")) {
    const id = Number(data.slice("cancel:".length));
    const result = Number.isInteger(id) ? await deps.bookings.cancel(id, chatId, deps.clock(now)) : "not_allowed";
    await deps.telegram.sendMessage(
      chatId,
      result === "cancelled" ? texts.guestCancelled[session.lang] : result === "not_allowed" ? texts.cannotCancel[session.lang] : texts.error[session.lang]
    );
    return null;
  }

  if (!session.consentAt) {
    await deps.telegram.sendMessage(chatId, texts.consentFirst);
    return null;
  }

  if (data === "abort") {
    await deps.telegram.sendMessage(chatId, texts.aborted[session.lang], REMOVE_KEYBOARD);
    return resetDialog(session);
  }

  if (data === "edit" && session.state === "awaiting_confirm") {
    await deps.telegram.sendMessage(chatId, texts.whatToChange[session.lang]);
    return { ...session, state: "clarifying", clarifyRounds: 0 };
  }

  if (data === "confirm" && session.state === "awaiting_confirm") {
    if (!session.draft.phone) {
      await deps.telegram.sendMessage(chatId, texts.askContact[session.lang], contactKeyboard(texts.contactButton));
      return { ...session, state: "awaiting_contact" };
    }
    return book(session, deps, now);
  }

  if (data.startsWith("time:") && session.state === "choosing_time") {
    const time = data.slice("time:".length);
    if (!session.draft.offeredTimes?.includes(time)) {
      await deps.telegram.sendMessage(chatId, texts.stale[session.lang]);
      return null;
    }
    return book({ ...session, draft: { ...session.draft, time } }, deps, now);
  }

  await deps.telegram.sendMessage(chatId, texts.stale[session.lang]);
  return null;
}

// --- Booking --------------------------------------------------------------------

/** All fields, a phone and consent are in: find a table and create a
 * pending booking, or offer the nearest free times that day. */
async function book(session: Session, deps: BotDeps, now: Date): Promise<Session> {
  const chatId = session.chatId;
  const d = session.draft;
  const lang = session.lang;
  const clock = deps.clock(now);

  if (!d.date || !d.time || !d.partySize || !d.name || !d.phone) {
    await deps.telegram.sendMessage(chatId, texts.question(lang, missingFields(d), []), REMOVE_KEYBOARD);
    return { ...session, state: "clarifying" };
  }
  if (startHasPassed(d.date, d.time, clock)) {
    await deps.telegram.sendMessage(chatId, texts.question(lang, ["time"], [{ code: "time_in_past" }]), REMOVE_KEYBOARD);
    return { ...session, state: "clarifying", draft: { ...d, time: null } };
  }

  const result = await deps.bookings.create({
    chatId,
    date: d.date,
    time: d.time,
    partySize: d.partySize,
    name: d.name,
    phone: d.phone,
    transcript: d.transcript ?? "",
    consentAt: session.consentAt,
    aiRequestIds: d.aiRequestIds ?? [],
  });

  if (result.ok) {
    const details = texts.details(lang, { date: d.date, time: d.time, partySize: d.partySize, name: d.name, wishes: d.wishes ?? null });
    await deps.telegram.sendMessage(
      chatId,
      `${texts.accepted[lang]}\n${details}`,
      inlineKeyboard([[{ text: texts.cancelBookingButton, callback_data: `cancel:${result.reservationId}` }]])
    );
    return resetDialog(session);
  }

  if (result.reason === "error") {
    await deps.telegram.sendMessage(chatId, texts.error[lang], REMOVE_KEYBOARD);
    return session;
  }

  const alternatives = await deps.bookings.freeTimes(d.date, d.time, d.partySize, clock);
  const intro = result.reason === "taken" ? `${texts.justTaken[lang]} ` : "";
  if (!alternatives.length) {
    await deps.telegram.sendMessage(chatId, intro + texts.noTableAt(lang, d.time, []), REMOVE_KEYBOARD);
    return { ...session, state: "clarifying", clarifyRounds: 0, draft: { ...d, date: null, time: null } };
  }
  await deps.telegram.sendMessage(chatId, intro + texts.noTableAt(lang, d.time, alternatives), timesKeyboard(alternatives));
  return { ...session, state: "choosing_time", draft: { ...d, offeredTimes: alternatives } };
}

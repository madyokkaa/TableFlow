import { createAdminClient } from "@/lib/supabase/admin";
import type { Lang } from "./texts";

export const SESSION_TTL_MS = 30 * 60_000;
export const MAX_TRANSCRIPT_LENGTH = 2000;

export type SessionState = "idle" | "awaiting_consent" | "clarifying" | "awaiting_confirm" | "awaiting_contact" | "choosing_time";

/** The booking being assembled across messages. */
export type Draft = {
  date?: string | null;
  time?: string | null;
  partySize?: number | null;
  name?: string | null;
  wishes?: string | null;
  phone?: string | null;
  /** What the guest said, for the hostess to check (<= 2000 chars). */
  transcript?: string;
  /** ai_requests rows that went into this draft, linked to the booking. */
  aiRequestIds?: number[];
  /** A message that arrived before consent, handled right after it. */
  pendingText?: string;
  pendingVoice?: { fileId: string; duration: number; fileSize: number | null };
  /** The times offered while choosing_time. */
  offeredTimes?: string[];
};

export type Session = {
  chatId: number;
  state: SessionState;
  draft: Draft;
  clarifyRounds: number;
  lang: Lang;
  consentAt: string | null;
};

export type SessionStore = {
  load(chatId: number, fallbackLang: Lang, now: Date): Promise<Session>;
  save(session: Session, now: Date): Promise<void>;
};

/** A session idle for 30 minutes starts over - but consent and language
 * are about the person, not the conversation, so they survive. */
export function freshSession(chatId: number, lang: Lang, consentAt: string | null = null): Session {
  return { chatId, state: "idle", draft: {}, clarifyRounds: 0, lang, consentAt };
}

export const supabaseSessionStore: SessionStore = {
  async load(chatId, fallbackLang, now) {
    const { data, error } = await createAdminClient()
      .from("telegram_sessions")
      .select("state, draft, clarify_rounds, lang, consent_at, updated_at")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (error) throw new Error(`session load failed: ${error.code}`);
    if (!data) return freshSession(chatId, fallbackLang);
    const lang = data.lang === "kk" || data.lang === "ru" ? data.lang : fallbackLang;
    if (now.getTime() - Date.parse(data.updated_at) > SESSION_TTL_MS) return freshSession(chatId, lang, data.consent_at);
    return {
      chatId,
      state: data.state as SessionState,
      draft: (data.draft ?? {}) as Draft,
      clarifyRounds: data.clarify_rounds ?? 0,
      lang,
      consentAt: data.consent_at,
    };
  },
  async save(session, now) {
    const { error } = await createAdminClient().from("telegram_sessions").upsert({
      chat_id: session.chatId,
      state: session.state,
      draft: session.draft,
      clarify_rounds: session.clarifyRounds,
      lang: session.lang,
      consent_at: session.consentAt,
      updated_at: now.toISOString(),
    });
    if (error) throw new Error(`session save failed: ${error.code}`);
  },
};

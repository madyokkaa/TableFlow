import { extractBooking } from "@/lib/ai/extractBooking";
import { transcribe } from "@/lib/ai/groq";
import { hitRateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rateLimit";
import { answerCallbackQuery, editMessageText, getFileBlob, sendMessage } from "@/lib/telegram";
import { defaultClock, type BotDeps } from "./bot";
import { supabaseSessionStore } from "./session";
import { supabaseBookingStore } from "./store";

/** The site's address for links from the bot. NEXT_PUBLIC_SITE_URL is baked
 * in at build time, so a deploy built before it was set has none - then
 * Vercel's own production domain (set at runtime) stands in. */
export function siteUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercelDomain ? `https://${vercelDomain.replace(/\/+$/, "")}` : null;
}

/** AI_BOOKING_ENABLED=0 is the kill switch; anything else (or unset) leaves
 * the AI on. */
export function aiBookingEnabled(): boolean {
  return process.env.AI_BOOKING_ENABLED?.trim() !== "0";
}

/** Per-chat limit on incoming messages (keyed by an HMAC of the chat id,
 * never the id itself). The "over the limit" notice is itself limited to
 * one per window, so a flood gets one polite answer and then silence. */
async function chatRateLimit(chatId: number): Promise<"allowed" | "limited" | "silent"> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return "allowed";
  const rule = RATE_LIMITS.telegramChat;
  const allowed = await hitRateLimit(rateLimitKey("telegram.chat", String(chatId)), rule);
  if (allowed !== false) return "allowed";
  const notice = await hitRateLimit(rateLimitKey("telegram.chat.notice", String(chatId)), { limit: 1, windowSeconds: rule.windowSeconds });
  return notice === false ? "silent" : "limited";
}

/** The real wiring: Telegram, Supabase, Groq. */
export function productionBotDeps(): BotDeps {
  return {
    telegram: { sendMessage, editMessageText, answerCallbackQuery, getFileBlob },
    sessions: supabaseSessionStore,
    bookings: supabaseBookingStore,
    extract: (text, now) => extractBooking(text, now),
    transcribe,
    rateLimit: chatRateLimit,
    now: () => new Date(),
    clock: defaultClock,
    config: {
      aiEnabled: aiBookingEnabled(),
      siteUrl: siteUrl(),
      restaurantName: process.env.RESTAURANT_NAME?.trim() || null,
    },
  };
}

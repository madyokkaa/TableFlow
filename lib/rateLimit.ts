import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitRule = { windowSeconds: number; limit: number };

export const RATE_LIMIT_MESSAGE = "слишком много запросов, попробуйте позже";

// Longest window the rate_limit_hit SQL function accepts (it prunes rows
// older than a day).
const MAX_WINDOW_SECONDS = 86_400;

/** Reads an override in the form "<limit>/<windowSeconds>" (e.g.
 * RATE_LIMIT_RESERVATIONS="20/60"); anything missing or malformed keeps
 * the default. */
export function ruleFromEnv(value: string | undefined, fallback: RateLimitRule): RateLimitRule {
  if (!value) return fallback;
  const match = value.trim().match(/^(\d+)\/(\d+)$/);
  const limit = match ? Number(match[1]) : NaN;
  const windowSeconds = match ? Number(match[2]) : NaN;
  if (!(limit >= 1) || !(windowSeconds >= 1) || windowSeconds > MAX_WINDOW_SECONDS) {
    console.warn("[rateLimit] ignoring malformed override, expected <limit>/<seconds>", value);
    return fallback;
  }
  return { limit, windowSeconds };
}

// Per-IP limits for the public routes. Booking is the one an anonymous
// caller could abuse to fill the floor, data erasure the one that must not
// become a way to probe contacts - hence the much tighter last one.
export const RATE_LIMITS = {
  reservationCreate: ruleFromEnv(process.env.RATE_LIMIT_RESERVATIONS, { limit: 10, windowSeconds: 60 }),
  availability: ruleFromEnv(process.env.RATE_LIMIT_AVAILABILITY, { limit: 60, windowSeconds: 60 }),
  privacyErase: ruleFromEnv(process.env.RATE_LIMIT_PRIVACY_ERASE, { limit: 3, windowSeconds: 3600 }),
  // Incoming Telegram messages per chat - mostly to protect the Groq quota.
  telegramChat: ruleFromEnv(process.env.RATE_LIMIT_TELEGRAM_CHAT, { limit: 20, windowSeconds: 600 }),
} as const;

/** The caller's address: the first entry of x-forwarded-for (set by
 * Vercel's edge), or "unknown" - which then shares one bucket for every
 * caller without the header. */
export function clientIp(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** The stored key: route name plus a keyed hash of the IP, so the
 * rate_limits table never holds raw addresses. */
export function rateLimitKey(name: string, ip: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const digest = createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22);
  return `${name}:${digest}`;
}

/** Seconds until the current window ends - windows are aligned to the
 * epoch, the same way rate_limit_hit computes them. */
export function retryAfterSeconds(windowSeconds: number, nowMs: number = Date.now()): number {
  const nowSeconds = Math.floor(nowMs / 1000);
  return Math.max(1, windowSeconds - (nowSeconds % windowSeconds));
}

/** One hit on an arbitrary counter key (already hashed - see rateLimitKey).
 * true = within the limit, false = exceeded, null = the counter couldn't be
 * reached (callers fail open). Shared by checkRateLimit (per IP) and the
 * Telegram bot (per chat). */
export async function hitRateLimit(key: string, { windowSeconds, limit }: RateLimitRule): Promise<boolean | null> {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    });
    if (error) {
      console.error("[rateLimit] rate_limit_hit failed", key.split(":")[0], error.code);
      return null;
    }
    return data !== false;
  } catch (err) {
    console.error("[rateLimit] rate_limit_hit threw", key.split(":")[0], (err as Error)?.name);
    return null;
  }
}

/** Counts this request against `name`'s per-IP limit. Returns the 429
 * response to send when the limit is exceeded, or null to carry on. Fails
 * open: if the counter can't be reached the request goes through (and the
 * failure is logged) - an unavailable limiter must not take booking down
 * with it. RATE_LIMIT_DISABLED=1 turns it off (tests). */
export async function checkRateLimit(request: Request, name: string, rule: RateLimitRule): Promise<NextResponse | null> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return null;
  const allowed = await hitRateLimit(rateLimitKey(name, clientIp(request)), rule);
  if (allowed !== false) return null;
  return NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rule.windowSeconds)) } }
  );
}

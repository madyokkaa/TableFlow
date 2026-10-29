import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";
import { productionBotDeps } from "@/lib/telegram/deps";

// Room for a voice download plus two Groq calls after the 200 is sent.
export const maxDuration = 60;

function secretMatches(request: NextRequest): boolean {
  // Trimmed: a value pasted into the Vercel dashboard can carry a stray
  // space or newline, which would turn every update into a 401.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[telegram.webhook] TELEGRAM_WEBHOOK_SECRET is not configured - refusing updates");
    return false;
  }
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Setup check, safe to open in a browser: says which settings this
// deployment can see - never their values, only whether they're set and
// the webhook secret's length (to compare with the one given to Telegram).
export async function GET() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return NextResponse.json({
    webhook_secret_set: secret.length > 0,
    webhook_secret_length: secret.length,
    bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN?.trim(),
    groq_key_set: !!process.env.GROQ_API_KEY?.trim(),
    supabase_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ai_booking_enabled: process.env.AI_BOOKING_ENABLED?.trim() !== "0",
    vercel_env: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}

// Telegram webhook. Answers fast and does the slow part (voice download,
// Groq) after the response, so Telegram never times out and re-sends.
export async function POST(request: NextRequest) {
  if (!secretMatches(request)) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ error: "некорректное обновление" }, { status: 400 });
  }

  // Telegram re-delivers until it gets a 200: handle each update_id once.
  const { data: claimed, error } = await createAdminClient().rpc("telegram_claim_update", { p_update_id: update.update_id });
  if (error) {
    // Let Telegram retry later rather than risk handling it twice.
    console.error("[telegram.webhook] claim failed", { updateId: update.update_id, code: error.code });
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (claimed === false) return NextResponse.json({ ok: true });

  const deps = productionBotDeps();
  after(() => handleUpdate(update, deps));
  return NextResponse.json({ ok: true });
}

/**
 * Points the Telegram bot at this deployment's webhook and registers its
 * commands. Run once per environment (production bot, preview/test bot):
 *   npx tsx scripts/telegram-set-webhook.ts
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_SITE_URL
 * from .env.local (or the shell). Prints getWebhookInfo at the end; the
 * token itself is never printed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");

if (!token || !secret || !site) {
  console.error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_SITE_URL first.");
  process.exit(1);
}
if (secret.length < 32 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
  // Telegram only accepts A-Z, a-z, 0-9, _ and - in secret_token.
  console.error("TELEGRAM_WEBHOOK_SECRET must be 32+ characters of A-Z, a-z, 0-9, _ or -.");
  process.exit(1);
}
if (!site.startsWith("https://")) {
  console.error("NEXT_PUBLIC_SITE_URL must be an https:// address - Telegram only calls HTTPS webhooks.");
  process.exit(1);
}

async function call(method: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!body.ok) throw new Error(`${method}: ${body.description ?? res.status}`);
  return body.result;
}

async function main() {
  const url = `${site}/api/telegram`;
  await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(`setWebhook → ${url}`);

  for (const [language_code, start, cancel] of [
    ["", "Start / Бастау", "Cancel / Болдырмау"],
    ["ru", "Начать бронирование", "Отменить текущее бронирование"],
    ["kk", "Брондауды бастау", "Ағымдағы брондауды тоқтату"],
  ] as const) {
    await call("setMyCommands", {
      commands: [
        { command: "start", description: start },
        { command: "cancel", description: cancel },
      ],
      ...(language_code ? { language_code } : {}),
    });
  }
  console.log("setMyCommands: /start, /cancel");

  console.log("getWebhookInfo:", JSON.stringify(await call("getWebhookInfo"), null, 2));
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

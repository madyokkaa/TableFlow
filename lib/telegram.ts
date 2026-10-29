// Telegram Bot API over fetch. Failures are logged by method and error code
// only - never message text, names, phones or chat ids.

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };
export type ContactKeyboard = {
  keyboard: { text: string; request_contact: true }[][];
  resize_keyboard: true;
  one_time_keyboard: true;
};
export type RemoveKeyboard = { remove_keyboard: true };
export type ReplyMarkup = InlineKeyboard | ContactKeyboard | RemoveKeyboard;

export class TelegramError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TelegramError";
  }
}

function token(): string {
  const value = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!value) throw new TelegramError("tg_not_configured");
  return value;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (err instanceof TelegramError) throw err;
    throw new TelegramError((err as Error)?.name === "AbortError" ? "tg_timeout" : "tg_network");
  } finally {
    clearTimeout(timer);
  }
}

/** Calls a Bot API method; throws TelegramError(tg_http_<status> /
 * tg_timeout / tg_network / tg_not_configured). */
export async function callTelegram<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const bot = token();
  return withTimeout(async (signal) => {
    const res = await fetch(`${API}/bot${bot}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number } | null;
    if (!res.ok || !body?.ok) throw new TelegramError(`tg_http_${body?.error_code ?? res.status}`);
    return body.result as T;
  });
}

function logFailure(method: string, err: unknown) {
  console.error("[telegram] call failed", { method, code: err instanceof TelegramError ? err.code : "tg_unknown" });
}

/** Sends a message; returns its message_id, or null when it couldn't be
 * delivered (logged). Never throws - a failed notification must not break
 * the caller. */
export async function sendMessage(chatId: number, text: string, replyMarkup?: ReplyMarkup): Promise<number | null> {
  try {
    const result = await callTelegram<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      link_preview_options: { is_disabled: true },
    });
    return result.message_id;
  } catch (err) {
    logFailure("sendMessage", err);
    return null;
  }
}

export async function editMessageText(chatId: number, messageId: number, text: string, replyMarkup?: InlineKeyboard): Promise<boolean> {
  try {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    logFailure("editMessageText", err);
    return false;
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
  } catch (err) {
    logFailure("answerCallbackQuery", err);
  }
}

/** Downloads a file (a voice message) into memory - it is never written to
 * disk or storage. Refuses anything over MAX_VOICE_BYTES. */
export async function getFileBlob(fileId: string): Promise<{ blob: Blob; filename: string }> {
  const file = await callTelegram<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new TelegramError("tg_no_file_path");
  if ((file.file_size ?? 0) > MAX_VOICE_BYTES) throw new TelegramError("tg_file_too_large");
  const bot = token();
  return withTimeout(async (signal) => {
    const res = await fetch(`${API}/file/bot${bot}/${file.file_path}`, { signal });
    if (!res.ok) throw new TelegramError(`tg_file_http_${res.status}`);
    const blob = await res.blob();
    if (blob.size > MAX_VOICE_BYTES) throw new TelegramError("tg_file_too_large");
    return { blob, filename: file.file_path!.split("/").pop() || "voice.ogg" };
  });
}

export function inlineKeyboard(rows: InlineButton[][]): InlineKeyboard {
  return { inline_keyboard: rows };
}

export function contactKeyboard(label: string): ContactKeyboard {
  return { keyboard: [[{ text: label, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
}

export const REMOVE_KEYBOARD: RemoveKeyboard = { remove_keyboard: true };

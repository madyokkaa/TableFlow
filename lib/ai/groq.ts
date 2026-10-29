import { logAiRequest } from "./log";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 15_000;
// A Retry-After longer than this isn't worth waiting for inside one webhook.
const MAX_RETRY_WAIT_MS = 5_000;

export const DEFAULT_STT_MODEL = "whisper-large-v3";
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-20b";

export function sttModel(): string {
  return process.env.GROQ_STT_MODEL?.trim() || DEFAULT_STT_MODEL;
}
export function llmModel(): string {
  return process.env.GROQ_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
}

/** A Groq call that didn't produce a usable answer. `code` is safe to log:
 * groq_timeout, groq_rate_limited, groq_http_<status>, groq_network,
 * groq_not_configured, groq_bad_response. */
export class GroqError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "GroqError";
  }
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new GroqError("groq_not_configured");
  return key;
}

function retryAfterMs(res: Response): number {
  const header = Number(res.headers.get("retry-after"));
  return Number.isFinite(header) && header >= 0 ? Math.min(header * 1000, MAX_RETRY_WAIT_MS) : 1_000;
}

/** POST with a 15 s timeout and one retry on 429/5xx (honouring
 * Retry-After). `makeBody` is called per attempt - a FormData body can't be
 * sent twice. */
async function groqPost(path: string, makeBody: () => BodyInit, headers: Record<string, string> = {}): Promise<Response> {
  const key = apiKey();
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${GROQ_BASE_URL}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, ...headers },
        body: makeBody(),
        signal: controller.signal,
      });
    } catch (err) {
      throw new GroqError((err as Error)?.name === "AbortError" ? "groq_timeout" : "groq_network");
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(res)));
      continue;
    }
    throw new GroqError(res.status === 429 ? "groq_rate_limited" : `groq_http_${res.status}`);
  }
}

export type Transcription = { text: string; durationSec: number | null; aiRequestId: number | null };

/** Speech to text. The language isn't pinned - guests mix Kazakh and
 * Russian in one sentence. The audio only lives in memory for this call. */
export async function transcribe(audio: Blob, filename: string): Promise<Transcription> {
  const model = sttModel();
  const started = Date.now();
  try {
    const res = await groqPost("/audio/transcriptions", () => {
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model", model);
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      return form;
    });
    const body = (await res.json().catch(() => null)) as { text?: unknown; duration?: unknown } | null;
    if (!body || typeof body.text !== "string") throw new GroqError("groq_bad_response");
    const durationSec = typeof body.duration === "number" ? body.duration : null;
    const aiRequestId = await logAiRequest({
      kind: "stt",
      model,
      ok: true,
      latencyMs: Date.now() - started,
      audioSeconds: durationSec,
    });
    return { text: body.text.trim(), durationSec, aiRequestId };
  } catch (err) {
    const code = err instanceof GroqError ? err.code : "groq_unknown";
    await logAiRequest({ kind: "stt", model, ok: false, errorCode: code, latencyMs: Date.now() - started });
    throw err instanceof GroqError ? err : new GroqError(code);
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatJsonResult = { content: string; tokensIn: number | null; tokensOut: number | null; aiRequestId: number | null };

/** A chat completion in JSON mode. Deterministic settings by default
 * (temperature 0, seed 42) so the same message gets the same answer - and
 * an eval run is reproducible. */
export async function chatJson(
  messages: ChatMessage[],
  { temperature = 0, seed = 42, promptVersion = null, model = llmModel() }: {
    temperature?: number;
    seed?: number;
    promptVersion?: string | null;
    model?: string;
  } = {}
): Promise<ChatJsonResult> {
  const started = Date.now();
  try {
    const payload: Record<string, unknown> = {
      model,
      messages,
      temperature,
      seed,
      response_format: { type: "json_object" },
    };
    // gpt-oss models reason before answering; a short pass is plenty for
    // pulling five fields out of one message and keeps latency/tokens down.
    if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
    const res = await groqPost("/chat/completions", () => JSON.stringify(payload), { "content-type": "application/json" });
    const body = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new GroqError("groq_bad_response");
    const tokensIn = body?.usage?.prompt_tokens ?? null;
    const tokensOut = body?.usage?.completion_tokens ?? null;
    const aiRequestId = await logAiRequest({
      kind: "extract",
      model,
      promptVersion,
      ok: true,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    });
    return { content, tokensIn, tokensOut, aiRequestId };
  } catch (err) {
    const code = err instanceof GroqError ? err.code : "groq_unknown";
    await logAiRequest({ kind: "extract", model, promptVersion, ok: false, errorCode: code, latencyMs: Date.now() - started });
    throw err instanceof GroqError ? err : new GroqError(code);
  }
}

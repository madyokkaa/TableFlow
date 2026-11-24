import { baselineExtract } from "./baselineExtract";
import { coerceRaw, validateFields, type BookingFields, type Problem, type RawExtraction } from "./bookingFields";
import { restaurantClock, type RestaurantClock } from "./clock";
import { chatJson, GroqError } from "./groq";
import { buildExtractMessages, PROMPT_VERSION } from "./prompts/extractBooking";

export type ExtractionResult = {
  fields: BookingFields;
  problems: Problem[];
  lang: "kk" | "ru" | null;
  unclear: string[];
  /** true when the AI step failed and the rule-based baseline answered. */
  degraded: boolean;
  errorCode: string | null;
  aiRequestId: number | null;
  raw: RawExtraction;
  /** The model call's numbers (null when it wasn't made or failed). */
  usage: { latencyMs: number; tokensIn: number | null; tokensOut: number | null } | null;
};

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Text → booking fields. The model only reads the message; dates, opening
 * hours and limits are checked by code afterwards (validateFields). If the
 * model can't be reached or answers with something that isn't the JSON we
 * asked for, the rule-based baseline takes over and the result is marked
 * `degraded`. */
export async function extractBooking(
  text: string,
  now: Date = new Date(),
  { clock = restaurantClock(now), useAi = true }: { clock?: RestaurantClock; useAi?: boolean } = {}
): Promise<ExtractionResult> {
  let raw: RawExtraction | null = null;
  let errorCode: string | null = null;
  let aiRequestId: number | null = null;
  let usage: ExtractionResult["usage"] = null;

  if (useAi) {
    const started = Date.now();
    try {
      const result = await chatJson(buildExtractMessages(text, { todayIso: clock.todayIso, nowTime: hhmm(clock.nowMinutes) }), {
        promptVersion: PROMPT_VERSION,
      });
      aiRequestId = result.aiRequestId;
      usage = { latencyMs: Date.now() - started, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(result.content);
      } catch {
        parsed = null;
      }
      raw = coerceRaw(parsed);
      if (!raw) errorCode = "bad_json";
    } catch (err) {
      errorCode = err instanceof GroqError ? err.code : "groq_unknown";
    }
  } else {
    errorCode = "ai_disabled";
  }

  const degraded = raw === null;
  if (!raw) raw = baselineExtract(text, clock);

  const { fields, problems } = validateFields(raw, clock);
  return { fields, problems, lang: raw.lang, unclear: raw.unclear, degraded, errorCode, aiRequestId, raw, usage };
}

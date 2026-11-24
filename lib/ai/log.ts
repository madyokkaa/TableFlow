import { createAdminClient } from "@/lib/supabase/admin";

export type AiRequestLog = {
  kind: "stt" | "extract";
  model: string;
  promptVersion?: string | null;
  ok: boolean;
  errorCode?: string | null;
  latencyMs: number;
  audioSeconds?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
};

/** One row in ai_requests - numbers and codes only, never the message or
 * transcript. Returns the row id (to link it to the booking later) or null;
 * a logging failure never breaks the conversation. */
export async function logAiRequest(entry: AiRequestLog): Promise<number | null> {
  // Offline runs (evals) have no database configured - nothing to log to.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("ai_requests")
      .insert({
        kind: entry.kind,
        model: entry.model,
        prompt_version: entry.promptVersion ?? null,
        ok: entry.ok,
        error_code: entry.errorCode ?? null,
        latency_ms: Math.round(entry.latencyMs),
        audio_seconds: entry.audioSeconds ?? null,
        tokens_in: entry.tokensIn ?? null,
        tokens_out: entry.tokensOut ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[ai.log] insert failed", { kind: entry.kind, code: error.code });
      return null;
    }
    return data.id as number;
  } catch (err) {
    console.error("[ai.log] insert threw", { kind: entry.kind, name: (err as Error)?.name });
    return null;
  }
}

/** Attach the AI calls that led to a booking to it, for cost per booking. */
export async function linkAiRequests(ids: number[], reservationId: number): Promise<void> {
  if (!ids.length) return;
  try {
    const { error } = await createAdminClient().from("ai_requests").update({ reservation_id: reservationId }).in("id", ids);
    if (error) console.error("[ai.log] link failed", { reservationId, code: error.code });
  } catch (err) {
    console.error("[ai.log] link threw", { reservationId, name: (err as Error)?.name });
  }
}

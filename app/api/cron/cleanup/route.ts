import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeExpiredReservations, deleteStaleReservations } from "@/lib/reservationCleanup";
import { logAudit } from "@/lib/audit";
import { cronAuthorized } from "@/lib/cronAuth";

// Daily housekeeping, called by Vercel Cron (vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET`: close bookings whose time has
// passed, delete closed ones past the retention window (until now this only
// ran when a table was deleted), and drop rate-limit windows older than a
// day.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request, "cron.cleanup")) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let deleted: number;
  try {
    await completeExpiredReservations(supabase);
    deleted = await deleteStaleReservations(supabase);
  } catch (err) {
    console.error("[cron.cleanup] reservation cleanup failed", err);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { error: rateLimitError } = await supabase.from("rate_limits").delete().lt("window_start", dayAgo);
  if (rateLimitError) {
    // Non-fatal: rate_limit_hit prunes the same rows on its next call.
    console.error("[cron.cleanup] pruning rate_limits failed", rateLimitError);
  }

  await logAudit(supabase, {
    actor: null,
    role: "system",
    action: "reservation.cleanup",
    entity: "reservation",
    details: { deleted },
  });

  return NextResponse.json({ ok: true, deleted_reservations: deleted });
}

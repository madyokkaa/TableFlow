import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { restaurantClock } from "@/lib/ai/clock";
import { sendMessage } from "@/lib/telegram";
import { sendDueReminders } from "@/lib/telegram/reminders";

export const maxDuration = 60;

// "See you in an hour" for confirmed Telegram bookings. Called every 10
// minutes by Supabase pg_cron (supabase/manual/schedule_reminders.sql) with
// `Authorization: Bearer $CRON_SECRET`. Answers with a count only.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request, "cron.reminders")) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }
  try {
    const sent = await sendDueReminders(restaurantClock(), { supabase: createAdminClient(), send: sendMessage });
    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[cron.reminders] failed", { name: (err as Error)?.name });
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
}

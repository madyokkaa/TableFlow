import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rateLimit";
import { isValidEmail } from "@/lib/validation";

// Same text whether or not anything matched - the endpoint must not tell a
// caller whether a phone or email has ever booked here.
const ERASE_MESSAGE =
  "Запрос выполнен. Если у нас были завершённые или прошедшие брони с этим контактом, имя, телефон и email в них удалены. Предстоящие брони не затрагиваются — сначала отмените их.";

const CONTACT_ERROR = "укажите email или телефон полностью";

/** "email" or "phone" when the contact has a usable shape, else null. A
 * phone needs all its digits (10 without the country code, 11 with it) -
 * the same completeness rule as isCompletePhone in lib/phone.ts. */
function contactKind(contact: string): "email" | "phone" | null {
  if (contact.includes("@")) return isValidEmail(contact) ? "email" : null;
  if (!/^[\d\s()+-]+$/.test(contact)) return null;
  const digits = contact.replace(/\D/g, "").length;
  return digits === 10 || digits === 11 ? "phone" : null;
}

// Public: anonymise this guest's finished bookings (erase_guest_data). No
// sign-in - an anonymous booking has no account to sign in to - so it's
// limited to bookings that are already over, and rate-limited hard.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "privacy.erase", RATE_LIMITS.privacyErase);
  if (limited) return limited;

  const payload = await request.json().catch(() => ({}));
  const { contact } = payload as { contact?: unknown };
  const trimmed = typeof contact === "string" ? contact.trim() : "";
  if (!trimmed || trimmed.length > 255 || !contactKind(trimmed)) {
    return NextResponse.json({ error: "validation_failed", details: { contact: CONTACT_ERROR } }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: count, error } = await supabase.rpc("erase_guest_data", { p_contact: trimmed });
  if (error) {
    console.error("[privacy.erase] erase_guest_data failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  // How many rows, never which contact.
  await logAudit(supabase, {
    actor: null,
    role: "guest",
    action: "guest_data.erased",
    entity: "guest_data",
    details: { count: typeof count === "number" ? count : 0 },
  });

  return NextResponse.json({ ok: true, message: ERASE_MESSAGE });
}

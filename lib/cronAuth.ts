import { timingSafeEqual } from "node:crypto";

/** True when the request carries `Authorization: Bearer $CRON_SECRET`
 * (constant-time compare). With CRON_SECRET unset every call is refused. */
export function cronAuthorized(request: Request, route: string): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error(`[${route}] CRON_SECRET is not configured - refusing to run`);
    return false;
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

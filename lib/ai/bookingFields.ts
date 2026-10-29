import { addDaysIso, CLOSE_HOUR, DEFAULT_DURATION_MINUTES, MAX_ADVANCE_BOOKING_DAYS, OPEN_HOUR, timeToMinutes } from "@/lib/scheduling";
import type { RestaurantClock } from "./clock";

/** What the model (or the rule-based baseline) is asked to return. */
export type RawExtraction = {
  date: string | null;
  time: string | null;
  party_size: number | null;
  name: string | null;
  wishes: string | null;
  lang: "kk" | "ru" | null;
  unclear: string[];
};

export type BookingFields = {
  date: string | null;
  time: string | null;
  partySize: number | null;
  name: string | null;
  wishes: string | null;
};

export type FieldName = keyof Omit<BookingFields, "wishes">;

/** Why a field was thrown away - the bot asks about exactly that field. */
export type ProblemCode =
  | "date_invalid"
  | "date_in_past"
  | "date_too_far"
  | "time_invalid"
  | "outside_hours"
  | "time_in_past"
  | "party_invalid"
  | "party_too_large"
  | "name_invalid";

export type Problem = { field: FieldName; code: ProblemCode };

export const MAX_PARTY_SIZE = 100;
const MAX_NAME_LENGTH = 120;
const MAX_WISHES_LENGTH = 300;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Coerces whatever JSON came back into the expected shape, without judging
 * the values yet (that's validateFields). Wrong types become null. */
export function coerceRaw(value: unknown): RawExtraction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const party =
    typeof v.party_size === "number"
      ? v.party_size
      : typeof v.party_size === "string" && /^\d+$/.test(v.party_size.trim())
        ? Number(v.party_size)
        : null;
  return {
    date: str(v.date),
    time: str(v.time),
    party_size: party,
    name: str(v.name),
    wishes: str(v.wishes),
    lang: v.lang === "kk" || v.lang === "ru" ? v.lang : null,
    unclear: Array.isArray(v.unclear) ? v.unclear.filter((u): u is string => typeof u === "string").slice(0, 10) : [],
  };
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "19:00" / "9:30" / "19:00:00" → "19:00", or null when it isn't a time. */
export function normalizeTime(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The deterministic gate between "what the model said" and "what the bot
 * may book": every field is checked by code against the same rules as the
 * website (booking window, opening hours, party size). A field that fails
 * is dropped and reported, so the bot re-asks for that field only. */
export function validateFields(raw: RawExtraction, clock: RestaurantClock): { fields: BookingFields; problems: Problem[] } {
  const problems: Problem[] = [];
  const fields: BookingFields = { date: null, time: null, partySize: null, name: null, wishes: null };

  if (raw.date) {
    if (!isRealDate(raw.date)) problems.push({ field: "date", code: "date_invalid" });
    else if (raw.date < clock.todayIso) problems.push({ field: "date", code: "date_in_past" });
    else if (raw.date > addDaysIso(clock.todayIso, MAX_ADVANCE_BOOKING_DAYS)) problems.push({ field: "date", code: "date_too_far" });
    else fields.date = raw.date;
  }

  if (raw.time) {
    const time = normalizeTime(raw.time);
    if (!time) {
      problems.push({ field: "time", code: "time_invalid" });
    } else {
      const start = timeToMinutes(time);
      if (start < OPEN_HOUR * 60 || start + DEFAULT_DURATION_MINUTES > CLOSE_HOUR * 60) {
        problems.push({ field: "time", code: "outside_hours" });
      } else if (fields.date === clock.todayIso && start <= clock.nowMinutes) {
        problems.push({ field: "time", code: "time_in_past" });
      } else {
        fields.time = time;
      }
    }
  }

  if (raw.party_size !== null) {
    if (!Number.isInteger(raw.party_size) || raw.party_size < 1) problems.push({ field: "partySize", code: "party_invalid" });
    else if (raw.party_size > MAX_PARTY_SIZE) problems.push({ field: "partySize", code: "party_too_large" });
    else fields.partySize = raw.party_size;
  }

  if (raw.name) {
    if (raw.name.length > MAX_NAME_LENGTH) problems.push({ field: "name", code: "name_invalid" });
    else fields.name = raw.name;
  }

  if (raw.wishes) fields.wishes = raw.wishes.slice(0, MAX_WISHES_LENGTH);

  return { fields, problems };
}

/** Is `time` today already gone? Needed again when a draft's date and time
 * arrive in different messages. */
export function startHasPassed(date: string, time: string, clock: RestaurantClock): boolean {
  return date === clock.todayIso && timeToMinutes(time) <= clock.nowMinutes;
}

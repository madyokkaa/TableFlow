/** Formats digits typed into a phone field as a Russian mobile number,
 * "+7 (900) 000-00-00", live as the user types. Re-derives the mask from
 * the raw digits on every keystroke (rather than tracking cursor/selection
 * state), so it works whether the browser hands back the previous masked
 * value plus one new character or a pasted block of digits - simple, at
 * the cost of the cursor jumping to the end on mid-string edits, which is
 * an accepted trade-off for a field guests mostly type into once. */
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  else if (!digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);

  const rest = digits.slice(1);
  let result = "+7";
  if (rest.length > 0) result += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) result += ")";
  if (rest.length > 3) result += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) result += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) result += `-${rest.slice(8, 10)}`;
  return result;
}

/** A formatted phone is "complete" once it carries all 10 digits after the
 * country code - used to decide whether to show a validation hint, not to
 * block submission (an incomplete/absent phone is fine when email is
 * given instead). */
export function isCompletePhone(formatted: string): boolean {
  return formatted.replace(/\D/g, "").length === 11;
}

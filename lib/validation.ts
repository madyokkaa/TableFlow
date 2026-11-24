const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The single email-shape check every form and API route in this project
 * agrees on - kept here so the client-side hint and the server's own
 * validation never quietly drift apart. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export const MIN_PASSWORD_LENGTH = 8;

export const STRENGTH_LABELS = ["Введите не меньше 8 символов", "Слабый", "Средний", "Хороший", "Надёжный"] as const;

/** 0 until the password reaches the minimum length, then 1-4: one point for
 * the length plus one each for an upper-case letter, a digit and a symbol
 * (Latin or Cyrillic letters both count). Drives the four-bar meter. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  let score = 1;
  if (/[A-ZА-ЯЁ]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-zА-Яа-яЁё0-9]/.test(password)) score++;
  return score as 1 | 2 | 3 | 4;
}

import { describe, expect, it } from "vitest";
import { passwordStrength } from "../lib/passwordStrength";

describe("passwordStrength", () => {
  it("is 0 below the minimum length, whatever the characters", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("Ab1!xyz")).toBe(0);
  });

  it("scores length, upper case, digit and symbol one point each", () => {
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Abcdefgh")).toBe(2);
    expect(passwordStrength("Abcdefg1")).toBe(3);
    expect(passwordStrength("Abcdef1!")).toBe(4);
  });

  it("counts Cyrillic letters as letters, not symbols", () => {
    expect(passwordStrength("пароль-ок")).toBe(2);
    expect(passwordStrength("Парольчик1")).toBe(3);
    expect(passwordStrength("ёжикёжик")).toBe(1);
  });
});

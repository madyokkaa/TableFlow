import { describe, expect, it } from "vitest";
import { isValidTimeZone, restaurantNowMinutes, restaurantTodayIso, timeZoneOffsetMinutes } from "../lib/scheduling";
import { enforcedDates, requestTimeZone } from "../lib/requestTimeZone";

describe("time zone helpers", () => {
  // 2026-01-15 21:30 UTC.
  const winter = Date.UTC(2026, 0, 15, 21, 30);
  // 2026-07-15 12:00 UTC.
  const summer = Date.UTC(2026, 6, 15, 12, 0);

  it("knows each zone's offset, including daylight saving", () => {
    expect(timeZoneOffsetMinutes("Europe/Moscow", winter)).toBe(180);
    expect(timeZoneOffsetMinutes("Asia/Tokyo", winter)).toBe(540);
    expect(timeZoneOffsetMinutes("America/New_York", winter)).toBe(-300);
    expect(timeZoneOffsetMinutes("America/New_York", summer)).toBe(-240);
    expect(timeZoneOffsetMinutes("UTC", summer)).toBe(0);
  });

  it("puts 'today' and 'now' in the given zone", () => {
    // 21:30 UTC is already the next day in Tokyo, still the same day in UTC.
    const realNow = Date.now;
    Date.now = () => winter;
    try {
      expect(restaurantTodayIso("UTC")).toBe("2026-01-15");
      expect(restaurantTodayIso("Asia/Tokyo")).toBe("2026-01-16");
      expect(restaurantNowMinutes("UTC")).toBe(21 * 60 + 30);
      expect(restaurantNowMinutes("Europe/Moscow")).toBe(30);
    } finally {
      Date.now = realNow;
    }
  });

  it("accepts only real IANA zones", () => {
    expect(isValidTimeZone("Asia/Almaty")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("requestTimeZone", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/api/x", { headers });

  it("prefers the header, then the cookie", () => {
    expect(requestTimeZone(req({ "x-timezone": "Asia/Almaty", cookie: "tz=Europe%2FMoscow" }))).toBe("Asia/Almaty");
    expect(requestTimeZone(req({ cookie: "a=1; tz=Europe%2FMoscow; b=2" }))).toBe("Europe/Moscow");
  });

  it("never lets a spoofed zone move rule checks into the past", () => {
    const realNow = Date.now;
    // 2026-01-15 22:30 UTC: already Jan 16 in Moscow (UTC+3), still Jan 15
    // in a client claiming UTC-12.
    Date.now = () => Date.UTC(2026, 0, 15, 22, 30);
    try {
      expect(enforcedDates(req({ "x-timezone": "Etc/GMT+12" })).today).toBe("2026-01-16");
      // A client ahead of the fallback zone gets its own (later) today.
      expect(enforcedDates(req({ "x-timezone": "Pacific/Kiritimati" })).today).toBe("2026-01-16");
      // The advance window is cut at the earlier of the two last dates.
      expect(enforcedDates(req({ "x-timezone": "Pacific/Kiritimati" })).maxDate).toBe("2026-04-16");
    } finally {
      Date.now = realNow;
    }
  });

  it("ignores anything that isn't a real zone", () => {
    expect(requestTimeZone(req({ "x-timezone": "nonsense" }))).toBeUndefined();
    expect(requestTimeZone(req({ cookie: "tz=%E0%A4%A" }))).toBeUndefined();
    expect(requestTimeZone(req({}))).toBeUndefined();
  });
});

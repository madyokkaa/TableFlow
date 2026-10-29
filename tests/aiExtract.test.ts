/** The AI booking layer without a network: fetch (Groq) and the ai_requests
 * log are mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/log", () => ({ logAiRequest: vi.fn(async () => 1), linkAiRequests: vi.fn(async () => {}) }));

const { extractBooking } = await import("../lib/ai/extractBooking");
const { baselineExtract } = await import("../lib/ai/baselineExtract");
const { restaurantClock, upcomingDates, formatDateWords } = await import("../lib/ai/clock");
const { validateFields } = await import("../lib/ai/bookingFields");
const { PROMPT_VERSION } = await import("../lib/ai/prompts/extractBooking");

// Friday 2026-10-30, 15:00 in a UTC+9 zone (06:00 UTC).
const ZONE = "Asia/Tokyo";
const NOW = new Date("2026-10-30T06:00:00Z");
const clock = restaurantClock(NOW, ZONE);

function groqAnswer(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
      usage: { prompt_tokens: 900, completion_tokens: 60 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("restaurant clock and the date table", () => {
  it("uses the restaurant's zone across the UTC day boundary", () => {
    // 15:30 UTC on the 30th is already the 31st, 00:30 in Tokyo.
    const late = restaurantClock(new Date("2026-10-30T15:30:00Z"), ZONE);
    expect(late.todayIso).toBe("2026-10-31");
    expect(late.nowMinutes).toBe(30);
    const rows = upcomingDates(late.todayIso);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ iso: "2026-10-31", weekdayKk: "сенбі", weekdayRu: "суббота", relative: "бүгін / сегодня" });
    expect(rows[1].relative).toBe("ертең / завтра");
    expect(rows[2].relative).toBe("арғы күні / послезавтра");
    expect(rows[3].relative).toBeNull();
    expect(rows[13].iso).toBe("2026-11-13");
  });

  it("spells dates out in both languages", () => {
    expect(formatDateWords("2026-10-31", "kk")).toBe("31 қазан, сенбі");
    expect(formatDateWords("2026-10-31", "ru")).toBe("31 октября, суббота");
  });
});

describe("validateFields", () => {
  const base = { date: null, time: null, party_size: null, name: null, wishes: null, lang: null, unclear: [] };

  it("drops a past date, a time outside opening hours and an empty party", () => {
    const { fields, problems } = validateFields({ ...base, date: "2026-10-29", time: "23:00", party_size: 0, name: "Айгерім" }, clock);
    expect(fields).toEqual({ date: null, time: null, partySize: null, name: "Айгерім", wishes: null });
    expect(problems).toEqual([
      { field: "date", code: "date_in_past" },
      { field: "time", code: "outside_hours" },
      { field: "partySize", code: "party_invalid" },
    ]);
  });

  it("counts the visit length against closing time and today's clock", () => {
    // 21:00 + 90 min runs past 22:00; 14:00 today is already gone at 15:00.
    expect(validateFields({ ...base, date: "2026-10-31", time: "21:00" }, clock).problems).toEqual([
      { field: "time", code: "outside_hours" },
    ]);
    expect(validateFields({ ...base, date: "2026-10-30", time: "14:00" }, clock).problems).toEqual([
      { field: "time", code: "time_in_past" },
    ]);
    expect(validateFields({ ...base, date: "2026-10-30", time: "20:30" }, clock).fields.time).toBe("20:30");
  });

  it("rejects a date past the booking window and an oversized party", () => {
    const { problems } = validateFields({ ...base, date: "2027-06-01", party_size: 250 }, clock);
    expect(problems).toEqual([
      { field: "date", code: "date_too_far" },
      { field: "partySize", code: "party_too_large" },
    ]);
  });
});

describe("extractBooking", () => {
  it("asks the model deterministically with the date table and validates its answer", async () => {
    fetchMock.mockResolvedValueOnce(
      groqAnswer({ date: "2026-10-31", time: "19:00", party_size: 4, name: "Айгерім", wishes: null, lang: "kk", unclear: [] })
    );
    const result = await extractBooking("ертең кешкі 7-ге 4 адам, атым Айгерім", NOW, { clock });
    expect(result.degraded).toBe(false);
    expect(result.fields).toEqual({ date: "2026-10-31", time: "19:00", partySize: 4, name: "Айгерім", wishes: null });
    expect(result.lang).toBe("kk");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ temperature: 0, seed: 42, response_format: { type: "json_object" }, model: "openai/gpt-oss-20b" });
    expect(body.messages[0].content).toContain("2026-10-31 — сенбі / суббота — ертең / завтра");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "ертең кешкі 7-ге 4 адам, атым Айгерім" });
    expect(PROMPT_VERSION).toBe("extract_booking_v2");
  });

  it("re-asks only for what the model got wrong", async () => {
    fetchMock.mockResolvedValueOnce(groqAnswer({ date: "2026-10-01", time: "19:00", party_size: 2, name: null, lang: "ru", unclear: [] }));
    const result = await extractBooking("1 октября в 7 вечера вдвоём", NOW, { clock });
    expect(result.fields.date).toBeNull();
    expect(result.fields.time).toBe("19:00");
    expect(result.problems).toEqual([{ field: "date", code: "date_in_past" }]);
  });

  it("falls back to the baseline when the model returns broken JSON", async () => {
    fetchMock.mockResolvedValueOnce(groqAnswer("{not json"));
    const result = await extractBooking("завтра в 19:30 на двоих, меня зовут Дмитрий", NOW, { clock });
    expect(result.degraded).toBe(true);
    expect(result.errorCode).toBe("bad_json");
    expect(result.fields).toEqual({ date: "2026-10-31", time: "19:30", partySize: 2, name: "Дмитрий", wishes: null });
  });

  it("retries a 5xx once, then falls back to the baseline", async () => {
    const failing = () => new Response("oops", { status: 503, headers: { "retry-after": "0" } });
    fetchMock.mockResolvedValueOnce(failing()).mockResolvedValueOnce(failing());
    const result = await extractBooking("ертең кешкі 7-ге 4 адам", NOW, { clock });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.degraded).toBe(true);
    expect(result.errorCode).toBe("groq_http_503");
    expect(result.fields.partySize).toBe(4);
  });

  it("reports a rate limit and a missing key as codes, not exceptions", async () => {
    const limited = () => new Response("", { status: 429, headers: { "retry-after": "0" } });
    fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited());
    expect((await extractBooking("завтра", NOW, { clock })).errorCode).toBe("groq_rate_limited");

    vi.stubEnv("GROQ_API_KEY", "");
    const noKey = await extractBooking("завтра", NOW, { clock });
    expect(noKey.errorCode).toBe("groq_not_configured");
    expect(noKey.fields.date).toBe("2026-10-31");
  });
});

describe("baselineExtract", () => {
  // Today is Friday 2026-10-30.
  const cases: [string, Record<string, unknown>][] = [
    ["Сәлем, ертең кешкі 7-ге 4 адамға үстел керек, атым Айгерім", { date: "2026-10-31", time: "19:00", party_size: 4, name: "Айгерім", lang: "kk" }],
    ["Здравствуйте, на завтра в 19:30 на двоих, меня зовут Дмитрий", { date: "2026-10-31", time: "19:30", party_size: 2, name: "Дмитрий", lang: "ru" }],
    ["послезавтра в 2 дня, нас 3 человека", { date: "2026-11-01", time: "14:00", party_size: 3 }],
    ["арғы күні түскі 1-де үшеуміз", { date: "2026-11-01", time: "13:00", party_size: 3, lang: "kk" }],
    ["бүгін сағат 20.00-ге екеуміз", { date: "2026-10-30", time: "20:00", party_size: 2 }],
    ["31.10 в 18:00 на 6 персон", { date: "2026-10-31", time: "18:00", party_size: 6 }],
    ["5 қараша кешкі 6, бес адам, туған күн", { date: "2026-11-05", time: "18:00", party_size: 5, wishes: "туған күн" }],
    ["в субботу в 8 вечера, вчетвером, у окна", { date: "2026-10-31", time: "20:00", party_size: 4, wishes: "у окна" }],
    ["дүйсенбі кешкі 6", { date: "2026-11-02", time: "18:00" }],
    ["столик на пять человек на 12 ноября, я — Ольга", { date: "2026-11-12", time: null, party_size: 5, name: "Ольга" }],
    ["жұмаға 4 кісі, менің атым Ерлан", { date: "2026-10-30", party_size: 4, name: "Ерлан" }],
    ["сегодня в 19.30, двое, телефон 87011234567", { date: "2026-10-30", time: "19:30", party_size: 2, name: null }],
    ["забронировать стол на воскресенье", { date: "2026-11-01", time: null, party_size: null }],
    // Numbers in words, as speech recognition writes them.
    ["ертең кешкі жетіге төрт адам, атым Айгерім", { date: "2026-10-31", time: "19:00", party_size: 4, name: "Айгерім" }],
    ["бүгін сағат сегізде екеуміз", { date: "2026-10-30", time: "20:00", party_size: 2 }],
    ["ертең жеті жарымда бес кісі", { date: "2026-10-31", time: "19:30", party_size: 5 }],
    ["сенбі күні жетіге келеміз, алты адам", { date: "2026-10-31", time: "19:00", party_size: 6 }],
    ["завтра в семь вечера, нас четверо, меня зовут Мадияр", { date: "2026-10-31", time: "19:00", party_size: 4, name: "Мадияр" }],
    ["на завтра к восьми, на семь человек", { date: "2026-10-31", time: "20:00", party_size: 7 }],
    ["в субботу в половине восьмого, вдвоём", { date: "2026-10-31", time: "19:30", party_size: 2 }],
    ["столик на четыре на завтра", { date: "2026-10-31", time: null }],
  ];

  it.each(cases)("%s", (text, expected) => {
    expect(baselineExtract(text, clock)).toMatchObject(expected);
  });
});

describe("transcribe", () => {
  it("sends the audio as multipart with temperature 0 and no fixed language", async () => {
    const { transcribe } = await import("../lib/ai/groq");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ text: " ертең кешкі жетіге ", duration: 4.2 }), { status: 200 }));
    const result = await transcribe(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }), "voice.ogg");
    expect(result).toEqual({ text: "ертең кешкі жетіге", durationSec: 4.2, aiRequestId: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3");
    expect(form.get("temperature")).toBe("0");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.has("language")).toBe(false);
    // A kk/ru booking-vocabulary hint for Whisper, and a way to turn it off.
    expect(String(form.get("prompt"))).toContain("кешкі жетіге");
    vi.stubEnv("GROQ_STT_PROMPT", "");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ text: "x" }), { status: 200 }));
    await transcribe(new Blob([new Uint8Array([1])]), "voice.ogg");
    expect((fetchMock.mock.calls[1][1].body as FormData).has("prompt")).toBe(false);
  });
});

describe("voice files for Groq", () => {
  it("renames Telegram's .oga voice notes to .ogg with an audio type", async () => {
    const { audioForTranscription } = await import("../lib/telegram");
    const voice = audioForTranscription(new Blob([new Uint8Array(4)]), "voice/file_12.oga");
    expect(voice.filename).toBe("file_12.ogg");
    expect(voice.blob.type).toBe("audio/ogg");
    expect(voice.blob.size).toBe(4);
    expect(audioForTranscription(new Blob([]), "music/file_3.mp3").filename).toBe("file_3.mp3");
    expect(audioForTranscription(new Blob([]), "voice/file_4").filename).toBe("file_4.ogg");
  });
});

/** The bot's dialogue end to end with in-memory fakes - no Telegram, Groq
 * or Supabase. tests/telegramBooking.test.ts covers the real booking store
 * against a test project. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleUpdate, type BotDeps, type TgUpdate } from "../lib/telegram/bot";
import { freshSession, type Session } from "../lib/telegram/session";
import type { ExtractionResult } from "../lib/ai/extractBooking";
import type { BookingFields } from "../lib/ai/bookingFields";

const CHAT = 4242;
const USER = 4242;
const NOW = new Date("2026-10-30T06:00:00Z");
const CLOCK = { timeZone: "Asia/Tokyo", todayIso: "2026-10-30", nowMinutes: 15 * 60 };

function extraction(fields: Partial<BookingFields>, extra: Partial<ExtractionResult> = {}): ExtractionResult {
  const f: BookingFields = { date: null, time: null, partySize: null, name: null, wishes: null, ...fields };
  return {
    fields: f,
    problems: [],
    lang: "kk",
    unclear: [],
    degraded: false,
    errorCode: null,
    aiRequestId: 7,
    raw: { date: f.date, time: f.time, party_size: f.partySize, name: f.name, wishes: f.wishes, lang: "kk", unclear: [] },
    usage: null,
    ...extra,
  };
}

let sessions: Map<number, Session>;
let sent: { text: string; markup?: unknown }[];
let deps: BotDeps;
let updateId = 0;

function message(partial: Record<string, unknown>, chatType = "private"): TgUpdate {
  return {
    update_id: ++updateId,
    message: { message_id: updateId, chat: { id: CHAT, type: chatType }, from: { id: USER, language_code: "kk" }, ...partial },
  };
}
function button(data: string): TgUpdate {
  return {
    update_id: ++updateId,
    callback_query: { id: `cb${updateId}`, from: { id: USER }, data, message: { message_id: 1, chat: { id: CHAT, type: "private" } } },
  };
}
const last = () => sent[sent.length - 1];

beforeEach(() => {
  sessions = new Map();
  sent = [];
  deps = {
    telegram: {
      sendMessage: vi.fn(async (_chat: number, text: string, markup?: unknown) => {
        sent.push({ text, markup });
        return sent.length;
      }),
      editMessageText: vi.fn(async () => true),
      answerCallbackQuery: vi.fn(async () => {}),
      getFileBlob: vi.fn(async () => ({ blob: new Blob([new Uint8Array(10)]), filename: "voice.ogg" })),
    },
    sessions: {
      load: async (chatId, lang) => structuredClone(sessions.get(chatId) ?? freshSession(chatId, lang)),
      save: async (s) => void sessions.set(s.chatId, structuredClone(s)),
    },
    bookings: {
      freeTimes: vi.fn(async () => ["18:00", "18:30", "20:00"]),
      create: vi.fn(async () => ({ ok: true as const, reservationId: 501 })),
      cancel: vi.fn(async () => "cancelled" as const),
    },
    extract: vi.fn(async () => extraction({})),
    transcribe: vi.fn(async () => ({ text: "ертең кешкі 7-ге", durationSec: 3, aiRequestId: 6 })),
    rateLimit: vi.fn(async () => "allowed" as const),
    now: () => NOW,
    clock: () => CLOCK,
    config: { aiEnabled: true, siteUrl: "https://example.test", restaurantName: null },
  };
});

async function consent() {
  await handleUpdate(message({ text: "/start" }), deps);
  await handleUpdate(button("consent"), deps);
}

describe("telegram bot dialogue", () => {
  it("greets with the AI disclosure and asks for consent first", async () => {
    await handleUpdate(message({ text: "/start" }), deps);
    expect(last().text).toContain("Хабарламаларды ЖИ өңдейді, брондауды әкімші растайды");
    expect(last().text).toContain("Сообщения обрабатывает ИИ, бронь подтверждает администратор");
    expect(last().text).toContain("https://example.test/privacy");
    expect(JSON.stringify(last().markup)).toContain('"callback_data":"consent"');
    expect(sessions.get(CHAT)?.state).toBe("awaiting_consent");
  });

  it("goes text → summary → ✅ → own contact → pending booking", async () => {
    await consent();
    vi.mocked(deps.extract).mockResolvedValueOnce(
      extraction({ date: "2026-10-31", time: "19:00", partySize: 4, name: "Айгерім", wishes: "терезе жанында" })
    );
    await handleUpdate(message({ text: "ертең кешкі 7-ге 4 адам, атым Айгерім, терезе жанында" }), deps);
    expect(last().text).toBe("31 қазан, сенбі, 19:00, 4 адам, Айгерім. Тілек: терезе жанында. Дұрыс па?");
    expect(JSON.stringify(last().markup)).toContain('"callback_data":"confirm"');

    await handleUpdate(button("confirm"), deps);
    expect(JSON.stringify(last().markup)).toContain('"request_contact":true');
    expect(sessions.get(CHAT)?.state).toBe("awaiting_contact");

    await handleUpdate(message({ contact: { phone_number: "77011234567", user_id: USER } }), deps);
    expect(deps.bookings.create).toHaveBeenCalledWith({
      chatId: CHAT,
      date: "2026-10-31",
      time: "19:00",
      partySize: 4,
      name: "Айгерім",
      phone: "+7 (701) 123-45-67",
      transcript: "ертең кешкі 7-ге 4 адам, атым Айгерім, терезе жанында",
      consentAt: NOW.toISOString(),
      aiRequestIds: [7],
    });
    expect(last().text).toContain("Өтінім қабылданды ✅");
    expect(JSON.stringify(last().markup)).toContain('"callback_data":"cancel:501"');
    expect(sessions.get(CHAT)?.state).toBe("idle");
  });

  it("refuses a contact card that isn't the guest's own", async () => {
    await consent();
    vi.mocked(deps.extract).mockResolvedValueOnce(extraction({ date: "2026-10-31", time: "19:00", partySize: 2, name: "Ерлан" }));
    await handleUpdate(message({ text: "..." }), deps);
    await handleUpdate(button("confirm"), deps);
    await handleUpdate(message({ contact: { phone_number: "77010000000", user_id: 999 } }), deps);
    expect(deps.bookings.create).not.toHaveBeenCalled();
    expect(last().text).toBe("Төмендегі батырма арқылы өз нөміріңізбен бөлісіңіз.");
  });

  it("ignores group chats entirely", async () => {
    await handleUpdate(message({ text: "/start" }, "group"), deps);
    await handleUpdate(message({ text: "ертең 4 адам" }, "supergroup"), deps);
    expect(deps.telegram.sendMessage).not.toHaveBeenCalled();
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("asks only for what's missing, merges answers, and gives up after three rounds", async () => {
    await consent();
    vi.mocked(deps.extract)
      .mockResolvedValueOnce(extraction({ date: "2026-10-31", partySize: 2 }))
      .mockResolvedValueOnce(extraction({ name: "Айгерім" }))
      .mockResolvedValueOnce(extraction({}))
      .mockResolvedValueOnce(extraction({}));
    await handleUpdate(message({ text: "ертең екеуміз" }), deps);
    expect(last().text).toBe("Қай уақытқа? Атыңыз кім?");
    await handleUpdate(message({ text: "атым Айгерім" }), deps);
    expect(last().text).toBe("Қай уақытқа?");
    expect(sessions.get(CHAT)?.draft).toMatchObject({ date: "2026-10-31", partySize: 2, name: "Айгерім" });
    await handleUpdate(message({ text: "білмеймін" }), deps);
    await handleUpdate(message({ text: "?" }), deps);
    expect(last().text).toContain("https://example.test");
    expect(sessions.get(CHAT)?.state).toBe("idle");
    expect(deps.bookings.create).not.toHaveBeenCalled();
  });

  it("says why a value was rejected and asks for it again", async () => {
    await consent();
    vi.mocked(deps.extract).mockResolvedValueOnce(
      extraction({ date: "2026-10-31", partySize: 2, name: "Ерлан" }, { problems: [{ field: "time", code: "outside_hours" }] })
    );
    await handleUpdate(message({ text: "ертең түнгі 2-де" }), deps);
    expect(last().text).toBe("Бұл уақытта мейрамхана жұмыс істемейді. Қай уақытқа?");
  });

  it("offers the nearest free times when the table is gone, and books the one picked", async () => {
    await consent();
    vi.mocked(deps.extract).mockResolvedValueOnce(extraction({ date: "2026-10-31", time: "19:00", partySize: 4, name: "Айгерім" }));
    vi.mocked(deps.bookings.create)
      .mockResolvedValueOnce({ ok: false, reason: "taken" })
      .mockResolvedValueOnce({ ok: true, reservationId: 502 });
    await handleUpdate(message({ text: "..." }), deps);
    await handleUpdate(button("confirm"), deps);
    await handleUpdate(message({ contact: { phone_number: "+77011234567", user_id: USER } }), deps);
    expect(last().text).toContain("Бұл үстелді жаңа ғана біреу алып қойды.");
    expect(JSON.stringify(last().markup)).toContain('"callback_data":"time:18:30"');
    expect(sessions.get(CHAT)?.state).toBe("choosing_time");

    await handleUpdate(button("time:18:30"), deps);
    expect(vi.mocked(deps.bookings.create).mock.calls[1][0]).toMatchObject({ time: "18:30" });
    expect(last().text).toContain("Өтінім қабылданды ✅");
  });

  it("handles a message sent before consent right after consent is given", async () => {
    vi.mocked(deps.extract).mockResolvedValueOnce(extraction({ date: "2026-10-31" }));
    await handleUpdate(message({ text: "ертең" }), deps);
    expect(deps.extract).not.toHaveBeenCalled();
    await handleUpdate(button("consent"), deps);
    expect(deps.extract).toHaveBeenCalledWith("ертең", NOW);
  });

  it("transcribes a short voice message and refuses a long one", async () => {
    await consent();
    await handleUpdate(message({ voice: { file_id: "f1", duration: 90 } }), deps);
    expect(deps.telegram.getFileBlob).not.toHaveBeenCalled();
    expect(last().text).toContain("тым ұзын");

    await handleUpdate(message({ voice: { file_id: "f2", duration: 5, file_size: 20_000 } }), deps);
    expect(deps.transcribe).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledWith("ертең кешкі 7-ге", NOW);
    expect(sessions.get(CHAT)?.draft.aiRequestIds).toEqual([6, 7]);
  });

  it("answers with the website link and books nothing when AI_BOOKING_ENABLED=0", async () => {
    deps.config.aiEnabled = false;
    await handleUpdate(message({ text: "ертең 4 адам" }), deps);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(last().text).toContain("временно недоступно");
    expect(last().text).toContain("https://example.test");
  });

  it("answers a flood once, then stays quiet", async () => {
    vi.mocked(deps.rateLimit).mockResolvedValueOnce("limited").mockResolvedValueOnce("silent");
    await handleUpdate(message({ text: "1" }), deps);
    await handleUpdate(message({ text: "2" }), deps);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Слишком много сообщений");
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("cancels a booking from its chat via the button", async () => {
    await consent();
    await handleUpdate(button("cancel:501"), deps);
    expect(deps.bookings.cancel).toHaveBeenCalledWith(501, CHAT, CLOCK);
    expect(last().text).toBe("Брондау жойылды.");
  });
});

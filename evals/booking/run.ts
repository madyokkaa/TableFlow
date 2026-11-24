/**
 * Booking extraction eval: the AI step vs the no-AI baseline on the team's
 * labelled set (evals/booking/dataset.jsonl). See evals/booking/README.md.
 *   npx tsx evals/booking/run.ts [--model <groq model>] [--prompt-version <v>]
 * Needs GROQ_API_KEY. Writes evals/booking/results/<date>_<model>_<prompt>.jsonl
 * and …_summary.md.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { baselineExtract } from "../../lib/ai/baselineExtract";
import { validateFields, type BookingFields } from "../../lib/ai/bookingFields";
import type { RestaurantClock } from "../../lib/ai/clock";
import { extractBooking } from "../../lib/ai/extractBooking";
import { llmModel, sttModel, transcribe } from "../../lib/ai/groq";
import { PROMPT_VERSION } from "../../lib/ai/prompts/extractBooking";

const DIR = path.resolve(__dirname);
const TEMPERATURE = 0;
const SEED = 42;

type Expected = { date: string | null; time: string | null; party_size: number | null; name: string | null; wishes_present: boolean };
type Example = {
  id: string;
  input: "text" | "voice";
  text?: string;
  audio?: string;
  now: string;
  lang: "kk" | "ru" | "mixed";
  difficulty: "easy" | "hard";
  expected: Expected;
};

const FIELDS = ["date", "time", "party_size", "name", "wishes_present"] as const;
const CORE = ["date", "time", "party_size", "name"] as const;
type Field = (typeof FIELDS)[number];
type Prediction = Record<Field, string | number | boolean | null>;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function clockFor(now: string): RestaurantClock {
  const [h, m] = now.slice(11, 16).split(":").map(Number);
  return { timeZone: "dataset", todayIso: now.slice(0, 10), nowMinutes: h * 60 + m };
}

function toPrediction(f: BookingFields): Prediction {
  return { date: f.date, time: f.time, party_size: f.partySize, name: f.name, wishes_present: f.wishes !== null };
}

// In the product a failed AI call falls back to the baseline; in the eval
// that would credit the AI with the baseline's answers. A failed call
// counts as the AI returning nothing.
const NO_ANSWER: Prediction = { date: null, time: null, party_size: null, name: null, wishes_present: false };

async function aiPrediction(text: string, clock: RestaurantClock) {
  const result = await extractBooking(text, new Date(), { clock });
  return { result, prediction: result.degraded ? NO_ANSWER : toPrediction(result.fields) };
}

function expectedValue(e: Expected, field: Field) {
  return e[field];
}

function same(field: Field, predicted: Prediction[Field], expected: Expected[Field]): boolean {
  if (field === "name") {
    const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLocaleLowerCase("ru") : v);
    return norm(predicted) === norm(expected);
  }
  return predicted === expected;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : "—");
const ms = (v: number | null) => (v === null ? "—" : `${Math.round(v)} мс`);

type Row = {
  id: string;
  input: Example["input"];
  lang: Example["lang"];
  difficulty: Example["difficulty"];
  transcript: string;
  expected: Expected;
  ai: Prediction;
  aiDegraded: boolean;
  aiError: string | null;
  baseline: Prediction;
  /** voice only: the AI on the human transcript, to separate STT errors. */
  aiOnReference: Prediction | null;
  sttLatencyMs: number | null;
  audioSeconds: number | null;
  extractLatencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
};

async function runExample(ex: Example): Promise<Row> {
  const clock = clockFor(ex.now);
  let transcript = ex.text ?? "";
  let sttLatencyMs: number | null = null;
  let audioSeconds: number | null = null;

  if (ex.input === "voice") {
    const file = readFileSync(path.join(DIR, ex.audio!));
    const started = Date.now();
    const result = await transcribe(new Blob([file]), path.basename(ex.audio!));
    sttLatencyMs = Date.now() - started;
    audioSeconds = result.durationSec;
    transcript = result.text;
  }

  const { result: ai, prediction } = await aiPrediction(transcript, clock);
  const baseline = validateFields(baselineExtract(transcript, clock), clock).fields;
  const aiOnReference = ex.input === "voice" && ex.text ? (await aiPrediction(ex.text, clock)).prediction : null;

  return {
    id: ex.id,
    input: ex.input,
    lang: ex.lang,
    difficulty: ex.difficulty,
    transcript,
    expected: ex.expected,
    ai: prediction,
    aiDegraded: ai.degraded,
    aiError: ai.errorCode,
    baseline: toPrediction(baseline),
    aiOnReference,
    sttLatencyMs,
    audioSeconds,
    extractLatencyMs: ai.usage?.latencyMs ?? null,
    tokensIn: ai.usage?.tokensIn ?? null,
    tokensOut: ai.usage?.tokensOut ?? null,
  };
}

function accuracyTable(rows: Row[], who: "ai" | "baseline"): string[] {
  const groups: [string, Row[]][] = [
    ["все", rows],
    ["kk", rows.filter((r) => r.lang === "kk")],
    ["ru", rows.filter((r) => r.lang === "ru")],
    ["mixed", rows.filter((r) => r.lang === "mixed")],
    ["easy", rows.filter((r) => r.difficulty === "easy")],
    ["hard", rows.filter((r) => r.difficulty === "hard")],
  ];
  const lines = [`| Срез | n | ${FIELDS.join(" | ")} | все 4 поля |`, `| --- | --- | ${FIELDS.map(() => "---").join(" | ")} | --- |`];
  for (const [label, group] of groups) {
    if (!group.length) continue;
    const cells = FIELDS.map((f) => pct(group.filter((r) => same(f, r[who][f], expectedValue(r.expected, f))).length, group.length));
    const allCore = group.filter((r) => CORE.every((f) => same(f, r[who][f], expectedValue(r.expected, f)))).length;
    lines.push(`| ${label} | ${group.length} | ${cells.join(" | ")} | ${pct(allCore, group.length)} |`);
  }
  return lines;
}

function hallucinations(rows: Row[], who: "ai" | "baseline"): string {
  let invented = 0;
  let opportunities = 0;
  for (const r of rows) {
    for (const f of CORE) {
      if (r.expected[f] !== null) continue;
      opportunities++;
      if (r[who][f] !== null) invented++;
    }
  }
  return pct(invented, opportunities);
}

function summary(rows: Row[], model: string, startedAt: Date): string {
  const voice = rows.filter((r) => r.input === "voice");
  let voiceErrors = 0;
  let sttCaused = 0;
  let unattributed = 0;
  for (const r of voice) {
    for (const f of CORE) {
      if (r.expected[f] === null || same(f, r.ai[f], r.expected[f])) continue;
      voiceErrors++;
      if (!r.aiOnReference) unattributed++;
      else if (same(f, r.aiOnReference[f], r.expected[f])) sttCaused++;
    }
  }
  const sttLatencies = rows.map((r) => r.sttLatencyMs).filter((v): v is number => v !== null);
  const extractLatencies = rows.map((r) => r.extractLatencyMs).filter((v): v is number => v !== null);
  const sum = (key: "tokensIn" | "tokensOut" | "audioSeconds") => rows.reduce((a, r) => a + (r[key] ?? 0), 0);

  return [
    `# Eval: извлечение брони — ${startedAt.toISOString().slice(0, 10)}`,
    "",
    "| Параметр | Значение |",
    "| --- | --- |",
    `| Дата прогона | ${startedAt.toISOString()} |`,
    `| Модель извлечения | \`${model}\` |`,
    `| Модель распознавания | \`${sttModel()}\` |`,
    `| Версия промпта | \`${PROMPT_VERSION}\` |`,
    `| temperature / seed | ${TEMPERATURE} / ${SEED} |`,
    `| Примеров | ${rows.length} (текст ${rows.length - voice.length}, голос ${voice.length}) |`,
    `| Сбои вызова ИИ (засчитаны как пустой ответ) | ${pct(rows.filter((r) => r.aiDegraded).length, rows.length)} |`,
    "",
    "## Точность — ИИ",
    "",
    ...accuracyTable(rows, "ai"),
    "",
    "## Точность — базовое решение без ИИ",
    "",
    ...accuracyTable(rows, "baseline"),
    "",
    "## Выдумки (поле заполнено, а в эталоне null)",
    "",
    `- ИИ: ${hallucinations(rows, "ai")}`,
    `- Базовое решение: ${hallucinations(rows, "baseline")}`,
    "",
    "## Голосовые",
    "",
    voice.length
      ? `- Ошибок ИИ по полям: ${voiceErrors}; из них из-за распознавания речи: ${pct(sttCaused, voiceErrors)}; без эталонного \`text\` (не определить): ${unattributed}`
      : "- Голосовых примеров нет.",
    "",
    "## Задержка и потребление",
    "",
    `- Распознавание: среднее ${ms(mean(sttLatencies))}, p95 ${ms(percentile(sttLatencies, 95))}`,
    `- Извлечение: среднее ${ms(mean(extractLatencies))}, p95 ${ms(percentile(extractLatencies, 95))}`,
    `- Токены: вход ${sum("tokensIn")}, выход ${sum("tokensOut")}`,
    `- Аудио: ${sum("audioSeconds").toFixed(1)} с`,
    "",
  ].join("\n");
}

async function main() {
  const model = arg("model");
  if (model) process.env.GROQ_LLM_MODEL = model;
  const promptVersion = arg("prompt-version");
  if (promptVersion && promptVersion !== PROMPT_VERSION) {
    throw new Error(`--prompt-version ${promptVersion} doesn't match the code (${PROMPT_VERSION}); prompts are versioned in code.`);
  }
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set.");

  const lines = readFileSync(path.join(DIR, "dataset.jsonl"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("evals/booking/dataset.jsonl is empty - the team labels the examples first (see README).");
  const examples = lines.map((l, i) => {
    try {
      return JSON.parse(l) as Example;
    } catch {
      throw new Error(`dataset.jsonl line ${i + 1} is not valid JSON`);
    }
  });
  if (examples.length < 30) console.warn(`Only ${examples.length} examples - the methodology asks for at least 30.`);

  const startedAt = new Date();
  const rows: Row[] = [];
  for (const ex of examples) {
    process.stdout.write(`${ex.id} … `);
    rows.push(await runExample(ex));
    console.log("ok");
  }

  const usedModel = llmModel();
  const stem = `${startedAt.toISOString().slice(0, 10)}_${usedModel.replace(/[^a-zA-Z0-9.-]+/g, "-")}_${PROMPT_VERSION}`;
  const outDir = path.join(DIR, "results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `${stem}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const md = summary(rows, usedModel, startedAt);
  writeFileSync(path.join(outDir, `${stem}_summary.md`), md);
  console.log(`\n${md}\nWritten: evals/booking/results/${stem}.jsonl, ${stem}_summary.md`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});

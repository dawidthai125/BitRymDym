/**
 * Judge for the one-button generator: how close is a generated beat to the source video?
 *
 * One Gemini verdict jumps ±1 point and even misreads the video's tempo (88 vs 92 on the same
 * film), so the beat is judged twice in parallel and the scores are averaged. Key and tone
 * come from our own measurement of the file, not from Gemini.
 */

import { keyShiftSemitones } from "@/lib/studio/samples/sample-bitek-plan";

export const JUDGE_DIMENSIONS = ["tempo", "groove_drums", "bass", "melody_instruments", "mood_energy", "mix_texture"] as const;
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export type JudgeRun = {
  overall: number;
  scores: Partial<Record<JudgeDimension, number>>;
  same: string[];
  different: string[];
  fix: string;
};

export type BeatVerdict = {
  /** Average Gemini overall (1–10, one decimal) before penalties. */
  geminiOverall: number;
  scores: Partial<Record<JudgeDimension, number>>;
  same: string[];
  different: string[];
  /** English production note for an automatic revision. */
  fix: string;
  runs: number;
  /** Key measured in the generated file ("Dm") and whether it fits the target key. */
  keyMeasured: string | null;
  keyTarget: string | null;
  keyOk: boolean | null;
  /** Ranking score: Gemini average minus 1.5 when the measured key misses the target. */
  score: number;
};

export const JUDGE_INSTRUCTION = [
  "Input 1 is a public YouTube music video (a rap song). Input 2 is an original instrumental hip-hop beat generated from a description of that video's beat.",
  "Compare ONLY the instrumental bed of the video (ignore vocals; never quote or transcribe lyrics) with the generated beat.",
  "Score 1 to 10 how close the beat is on: tempo, groove_drums, bass, melody_instruments, mood_energy, mix_texture, and overall.",
  "Be consistent: 10 = same production style and sound, 5 = same genre but clearly different sound, 1 = unrelated.",
  "same and different: short Polish points. fix: ONE English sentence of concrete production changes for the next generation (no artist or song names).",
  "Reply with JSON only.",
].join(" ");

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    overall: { type: "number" },
    scores: {
      type: "object",
      properties: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, { type: "number" }])),
    },
    same: { type: "array", items: { type: "string" } },
    different: { type: "array", items: { type: "string" } },
    fix: { type: "string" },
  },
  required: ["overall", "scores", "same", "different", "fix"],
};

function score(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

function texts(v: unknown, max = 5): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean).slice(0, max)
    : [];
}

/** One Gemini answer → a run, or null when it is not usable. Accepts scores flat or nested. */
export function parseJudgeRun(raw: string | null): JudgeRun | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const nested = row.scores && typeof row.scores === "object" ? (row.scores as Record<string, unknown>) : row;
  const scores: Partial<Record<JudgeDimension, number>> = {};
  for (const d of JUDGE_DIMENSIONS) {
    const s = score(nested[d]);
    if (s != null) scores[d] = s;
  }
  const overall = score(row.overall) ?? score(nested.overall);
  if (overall == null) return null;
  return { overall, scores, same: texts(row.same), different: texts(row.different), fix: typeof row.fix === "string" ? row.fix.trim().slice(0, 400) : "" };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const KEY_MISS_PENALTY = 1.5;

/** Average the runs and apply the measured-key check. Null when no run was usable. */
export function combineVerdict(
  runs: JudgeRun[],
  key: { measured: string | null; target: string | null },
): BeatVerdict | null {
  if (!runs.length) return null;
  const avg = (vals: number[]) => round1(vals.reduce((a, b) => a + b, 0) / vals.length);
  const scores: Partial<Record<JudgeDimension, number>> = {};
  for (const d of JUDGE_DIMENSIONS) {
    const vals = runs.map((r) => r.scores[d]).filter((v): v is number => v != null);
    if (vals.length) scores[d] = avg(vals);
  }
  const geminiOverall = avg(runs.map((r) => r.overall));
  const shift = key.measured && key.target ? keyShiftSemitones(key.measured, key.target) : null;
  const keyOk = shift == null ? null : shift === 0;
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 5);
  return {
    geminiOverall,
    scores,
    same: uniq(runs.flatMap((r) => r.same)),
    different: uniq(runs.flatMap((r) => r.different)),
    fix: runs.map((r) => r.fix).find(Boolean) ?? "",
    runs: runs.length,
    keyMeasured: key.measured,
    keyTarget: key.target,
    keyOk,
    score: round1(geminiOverall - (keyOk === false ? KEY_MISS_PENALTY : 0)),
  };
}

/** Below this the pipeline tries one automatic revision of the better variant. */
export const AUTO_REVISE_BELOW = 6.5;

export function needsAutoRevision(v: BeatVerdict): boolean {
  return v.keyOk === false || v.geminiOverall < AUTO_REVISE_BELOW;
}

/** The note sent to the revision: Gemini's fix plus the measured key problem, in plain words. */
export function autoRevisionNote(v: BeatVerdict): string {
  const parts: string[] = [];
  if (v.keyOk === false && v.keyMeasured && v.keyTarget) {
    parts.push(`Tonacja wyszła ${v.keyMeasured} zamiast ${v.keyTarget}: trzymaj ${v.keyTarget}.`);
  }
  const weak = JUDGE_DIMENSIONS.filter((d) => (v.scores[d] ?? 10) < 7);
  if (weak.length) parts.push(`Najsłabsze: ${weak.join(", ")}.`);
  if (v.different.length) parts.push(`Różnice: ${v.different.join("; ")}.`);
  if (v.fix) parts.push(v.fix);
  parts.push("Cel: co najmniej 9/10 w każdej kategorii.");
  return parts.join(" ").slice(0, 600);
}

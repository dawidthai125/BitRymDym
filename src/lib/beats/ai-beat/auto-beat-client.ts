/**
 * One-button generator, browser side: describe the video, generate two variants at once
 * (different seeds, model-default vs stricter prompt adherence), judge both, keep the better,
 * remove the other, then revise the best one until it reaches the target score (MAX_AUTO_REVISIONS).
 * Each step is an existing admin route; this file only orders them.
 */

import { autoRevisionNote, MAX_AUTO_REVISIONS, needsAutoRevision, type BeatVerdict } from "@/lib/beats/ai-beat/beat-judge";
import { descriptionFromYoutubeStyle } from "@/lib/beats/ai-beat/prompt";
import type { ReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";

/** Variant B follows the prompt more strictly (stable-audio-3 cfg_scale, default 1). */
export const AUTO_VARIANTS: { label: string; cfgScale: number | null }[] = [
  { label: "A", cfgScale: null },
  { label: "B", cfgScale: 4 },
];

export type AutoCandidate = {
  label: string;
  beatId: string;
  title: string;
  seed: number;
  cfgScale: number | null;
  description: string;
  bpm: number | null;
  verdict: BeatVerdict | null;
};

export type AutoStep =
  | "describe"
  | "generate"
  | "judge"
  | "revise"
  | "judgeRevision"
  | "done";

export type AutoProgress = { step: AutoStep; detail?: string };

export type AutoResult = {
  winner: AutoCandidate;
  candidates: AutoCandidate[];
  removed: string[];
  revised: boolean;
  style: string | null;
  description: string;
  bpm: number | null;
};

const json = async <T>(url: string, body: unknown): Promise<T & { success?: boolean; error?: string }> => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
  if (!res.ok || data.success === false) throw new Error(data.error || "request_failed");
  return data;
};

/** "Key: D minor." in a brief → "Dm". */
export function keyFromBrief(brief: string): string | null {
  const m = /Key:\s*([A-G](?:#|b)?)\s*(minor|major|moll|dur)?/i.exec(brief);
  if (!m) return null;
  return /minor|moll/i.test(m[2] ?? "") ? `${m[1]}m` : m[1];
}

/** Best by score; ties go to the higher Gemini average, then to variant A. */
export function pickWinner(candidates: AutoCandidate[]): AutoCandidate {
  const judged = candidates.filter((c) => c.verdict);
  const pool = judged.length ? judged : candidates;
  return [...pool].sort(
    (a, b) =>
      (b.verdict?.score ?? -1) - (a.verdict?.score ?? -1) ||
      (b.verdict?.geminiOverall ?? -1) - (a.verdict?.geminiOverall ?? -1),
  )[0];
}

async function waitForBeat(start: {
  generationId: string;
  title: string;
  style?: string | null;
  opis?: string | null;
  description: string;
  bpm: number | null;
}): Promise<{ beatId: string; bpm: number | null }> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await json<{ status?: string; beatId?: string; bpm?: number }>("/api/admin/beats/generate/result", {
      generationId: start.generationId,
      title: start.title,
      description: start.description,
      bpm: start.bpm,
      style: start.style ?? null,
      opis: start.opis ?? null,
    });
    if (res.status === "ready" && res.beatId) return { beatId: res.beatId, bpm: res.bpm ?? start.bpm };
  }
  throw new Error("timeout");
}

async function judgeOnce(beatId: string, youtubeUrl: string, targetKey: string | null): Promise<BeatVerdict | null> {
  try {
    const res = await json<{ verdict?: BeatVerdict }>("/api/admin/beats/generate/judge", { beatId, youtubeUrl, targetKey });
    return res.verdict ?? null;
  } catch {
    return null;
  }
}

/** One more try after a minute: Gemini's per-minute limit clears by then (live: 429). */
async function judge(beatId: string, youtubeUrl: string, targetKey: string | null): Promise<BeatVerdict | null> {
  const first = await judgeOnce(beatId, youtubeUrl, targetKey);
  if (first) return first;
  await new Promise((r) => setTimeout(r, 60_000));
  return judgeOnce(beatId, youtubeUrl, targetKey);
}

async function discard(beatId: string): Promise<boolean> {
  try {
    await json("/api/admin/beats/generate/discard", { beatId });
    return true;
  } catch {
    return false;
  }
}

export async function runAutoBeat(params: {
  youtubeUrl: string;
  durationSeconds: number;
  measured: ReferenceMeasure | null;
  onProgress: (p: AutoProgress) => void;
}): Promise<AutoResult> {
  const { youtubeUrl, onProgress } = params;

  onProgress({ step: "describe" });
  const described = await json<{ opis: string; style?: string; prompt?: string; bpmHint?: number | null }>(
    "/api/admin/beats/generate/style",
    { url: youtubeUrl, measured: params.measured },
  );
  const style = (described.style ?? "").trim() || null;
  const description = descriptionFromYoutubeStyle({ style: style || "hip-hop instrumentalny", opis: described.opis, prompt: described.prompt ?? null });
  const bpm = typeof described.bpmHint === "number" ? Math.round(described.bpmHint) : null;
  // Only a measured key may penalise a variant: Gemini's own key for the same film varied
  // between D minor, C# minor and G minor across runs (2026-11-20), so a brief key is a guess.
  const targetKey = params.measured?.key ?? null;

  onProgress({ step: "generate", detail: `${AUTO_VARIANTS.length}` });
  const settled = await Promise.allSettled(
    AUTO_VARIANTS.map(async (v) => {
      const start = await json<{ generationId: string; title: string; style?: string; opis?: string; seed: number; cfgScale: number | null }>(
        "/api/admin/beats/generate",
        { description, durationSeconds: params.durationSeconds, bpm, cfgScale: v.cfgScale },
      );
      const ready = await waitForBeat({ ...start, description, bpm });
      return { label: v.label, beatId: ready.beatId, title: start.title, seed: start.seed, cfgScale: start.cfgScale, description, bpm: ready.bpm, verdict: null } as AutoCandidate;
    }),
  );
  const candidates = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (!candidates.length) throw new Error("generate_failed");

  onProgress({ step: "judge" });
  // One after another: parallel judging hit Gemini's per-minute limit live.
  for (const c of candidates) c.verdict = await judge(c.beatId, youtubeUrl, targetKey);
  let winner = pickWinner(candidates);
  const removed: string[] = [];
  // Nothing is removed on a guess: only when every variant has a verdict.
  if (candidates.every((c) => c.verdict)) {
    for (const c of candidates) if (c !== winner && (await discard(c.beatId))) removed.push(c.beatId);
  }

  let revised = false;
  // Keep fixing the best beat until it reaches the target or the revisions run out.
  // Each round listens to the video and the current best beat again, so fixes build on each other.
  for (let round = 1; round <= MAX_AUTO_REVISIONS; round += 1) {
    if (!winner.verdict || !needsAutoRevision(winner.verdict)) break;
    const detail = `${round}/${MAX_AUTO_REVISIONS}`;
    onProgress({ step: "revise", detail });
    try {
      const start = await json<{ generationId: string; title: string; style?: string; opis?: string; description: string; bpm: number | null; seed: number; cfgScale: number | null }>(
        "/api/admin/beats/generate/bitek",
        {
          action: "revise",
          beatId: winner.beatId,
          note: autoRevisionNote(winner.verdict),
          youtubeUrl,
          brief: winner.description,
          measured: params.measured,
          seed: winner.seed,
          cfgScale: winner.cfgScale,
        },
      );
      const ready = await waitForBeat({ ...start, description: start.description, bpm: start.bpm });
      onProgress({ step: "judgeRevision", detail });
      const fixed: AutoCandidate = {
        label: `${winner.label}+`,
        beatId: ready.beatId,
        title: start.title,
        seed: start.seed,
        cfgScale: start.cfgScale,
        description: start.description,
        bpm: ready.bpm,
        verdict: await judge(ready.beatId, youtubeUrl, targetKey),
      };
      candidates.push(fixed);
      revised = true;
      if (!fixed.verdict) break;
      const better = pickWinner([winner, fixed]);
      const loser = better === winner ? fixed : winner;
      if (await discard(loser.beatId)) removed.push(loser.beatId);
      winner = better;
    } catch {
      // The current winner stays; a failed revision ends the loop.
      break;
    }
  }

  onProgress({ step: "done" });
  return { winner, candidates, removed, revised, style, description: winner.description, bpm: winner.bpm };
}

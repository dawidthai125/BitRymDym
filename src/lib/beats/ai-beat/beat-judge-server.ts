import "server-only";

import {
  combineVerdict,
  JUDGE_INSTRUCTION,
  JUDGE_SCHEMA,
  parseJudgeRun,
  type BeatVerdict,
  type JudgeRun,
} from "@/lib/beats/ai-beat/beat-judge";
import { loadMasterAudio, prepareBeatAudioForGemini } from "@/lib/beats/ai-beat/gemini-audio-compare";
import { geminiVideoModelChain, isGeminiCapacityStatus } from "@/lib/beats/ai-beat/gemini-models";
import { measureToneFacts } from "@/lib/beats/ai-beat/tone-facts";
import { parseYouTubeWatchUrl, textFromGemini } from "@/lib/beats/ai-beat/youtube-style";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";
import { BeatRequestError } from "@/lib/beats/request-error";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3-flash-preview";
/** Per call. Two calls run one after another inside the route's 300 s. */
const JUDGE_TIMEOUT_MS = 110_000;
/**
 * Each verdict sends the whole video plus the beat, a large token load; four in parallel hit
 * Gemini 429 for over a minute (2026-11-20). Calls now run one at a time, with long waits.
 */
const RATE_LIMIT_WAITS_MS = [15_000, 35_000];
export const JUDGE_RUNS = 2;

async function oneVerdict(params: {
  url: string;
  audio: { uri: string; mimeType: string };
  apiKey: string;
  model: string;
}): Promise<JudgeRun | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  const send = (model: string) =>
    fetch(INTERACTIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": params.apiKey, "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model,
        input: [
          { type: "video", uri: params.url },
          { type: "audio", uri: params.audio.uri, mime_type: params.audio.mimeType },
          { type: "text", text: JUDGE_INSTRUCTION },
        ],
        response_format: { type: "text", mime_type: "application/json", schema: JUDGE_SCHEMA },
        generation_config: { temperature: 0.1 },
      }),
    });
  try {
    // Next model first (separate daily limits), then a short wait on the last one.
    let res!: Response;
    for (const m of geminiVideoModelChain(params.model)) {
      res = await send(m);
      if (!isGeminiCapacityStatus(res.status)) break;
      console.error("[beat-judge] gemini busy", m, res.status);
    }
    const last = geminiVideoModelChain(params.model).at(-1)!;
    for (const wait of RATE_LIMIT_WAITS_MS) {
      if (res.status !== 429 && res.status !== 503) break;
      await new Promise((r) => setTimeout(r, wait));
      res = await send(last);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      console.error("[beat-judge] gemini HTTP", res.status, detail);
      return null;
    }
    return parseJudgeRun(textFromGemini(await res.json()));
  } catch (error) {
    console.error("[beat-judge] gemini failed", error instanceof Error ? error.name : "unknown");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Key of the generated master, from our detector (same one Bitek's review uses). */
async function measuredKey(master: { bytes: Uint8Array; contentType: string }): Promise<string | null> {
  try {
    const decoded = await decodeAudioToMonoPcm({ bytes: master.bytes, contentType: master.contentType });
    if (!decoded.ok) return null;
    return measureToneFacts(decoded.samples, decoded.sampleRate)?.key ?? null;
  } catch {
    return null;
  }
}

export async function judgeGeneratedBeat(params: {
  beatId: string;
  youtubeUrl: string;
  /** Target key: measured from the reference file, else the brief's "Key: …". */
  targetKey: string | null;
}): Promise<BeatVerdict> {
  const { requireAdminGenerator } = await import("@/lib/beats/ai-beat/generate");
  await requireAdminGenerator();
  const url = parseYouTubeWatchUrl(params.youtubeUrl);
  if (!url) throw new BeatRequestError("Wklej publiczny link YouTube.");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new BeatRequestError("Brak klucza Gemini na serwerze.");
  const model = (process.env.BEAT_STYLE_GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  const master = await loadMasterAudio(params.beatId);
  const [key, prepared] = await Promise.all([
    measuredKey(master),
    prepareBeatAudioForGemini(params.beatId, { loadMaster: async () => master }),
  ]);
  try {
    // One at a time: parallel calls tripped the per-minute token limit.
    const runs: JudgeRun[] = [];
    for (let i = 0; i < JUDGE_RUNS; i += 1) {
      const r = await oneVerdict({ url, audio: prepared.ref, apiKey, model });
      if (r) runs.push(r);
    }
    const verdict = combineVerdict(runs, { measured: key, target: params.targetKey });
    if (!verdict) throw new BeatRequestError("Gemini nie ocenił bitu. Spróbuj jeszcze raz.");
    return verdict;
  } finally {
    await prepared.cleanup();
  }
}

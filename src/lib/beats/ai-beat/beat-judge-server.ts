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
import { measureToneFacts } from "@/lib/beats/ai-beat/tone-facts";
import { parseYouTubeWatchUrl, textFromGemini } from "@/lib/beats/ai-beat/youtube-style";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";
import { BeatRequestError } from "@/lib/beats/request-error";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3-flash-preview";
/** Two verdicts in parallel; each must finish inside the route's 300 s with the upload. */
const JUDGE_TIMEOUT_MS = 150_000;
/** One pipeline makes ~8 Gemini calls in a few minutes; 429 came back live. Wait and retry. */
const RATE_LIMIT_WAITS_MS = [8_000, 20_000];
export const JUDGE_RUNS = 2;

async function oneVerdict(params: {
  url: string;
  audio: { uri: string; mimeType: string };
  apiKey: string;
  model: string;
}): Promise<JudgeRun | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  const send = () =>
    fetch(INTERACTIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": params.apiKey, "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: params.model,
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
    let res = await send();
    for (const wait of RATE_LIMIT_WAITS_MS) {
      if (res.status !== 429 && res.status !== 503) break;
      console.error("[beat-judge] gemini busy", res.status, "retry in", wait);
      await new Promise((r) => setTimeout(r, wait));
      res = await send();
    }
    if (!res.ok) {
      console.error("[beat-judge] gemini HTTP", res.status);
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
    // Staggered by 2 s so two calls do not hit the per-minute limit at the same instant.
    const runs = (
      await Promise.all(
        Array.from({ length: JUDGE_RUNS }, async (_, i) => {
          if (i) await new Promise((r) => setTimeout(r, 2000 * i));
          return oneVerdict({ url, audio: prepared.ref, apiKey, model });
        }),
      )
    ).filter((r): r is JudgeRun => r != null);
    const verdict = combineVerdict(runs, { measured: key, target: params.targetKey });
    if (!verdict) throw new BeatRequestError("Gemini nie ocenił bitu. Spróbuj jeszcze raz.");
    return verdict;
  } finally {
    await prepared.cleanup();
  }
}

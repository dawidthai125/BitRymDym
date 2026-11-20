/**
 * Closed loop for "Weź tę uwagę": the generated beat is uploaded to the Gemini Files API so
 * Gemini can compare it with the YouTube video and write a better brief.
 *
 * Every step here is best effort. A caller treats any thrown error as "no audio" and falls
 * back to the revision that only hears the video.
 *
 * API shape (Gemini docs, Files API + Interactions API):
 *  - upload: POST /upload/v1beta/files, resumable (X-Goog-Upload-* headers), then the upload URL
 *    from the x-goog-upload-url response header; the response has file.uri and file.name
 *  - input item: { type: "audio", uri, mime_type }
 *  - files are deleted by Google after 48 h; we delete ours right after use.
 */

import {
  describeBeatStyleFromYouTube,
  type BeatStyleFromYouTube,
  type YoutubeRevision,
  type YoutubeStyleDeps,
} from "@/lib/beats/ai-beat/youtube-style";
import type { ReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";

const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Only the start of the beat is sent. Beats loop, and a shorter file is faster to upload and hear. */
export const COMPARE_AUDIO_SECONDS = 75;
/** Upload plus processing must stay inside this budget, or the caller falls back. */
export const PREPARE_AUDIO_TIMEOUT_MS = 40_000;

type FetchFn = typeof fetch;

export type GeminiAudioRef = {
  uri: string;
  mimeType: string;
  /** Resource name, used to delete the file. */
  name: string;
};

/**
 * Cuts a PCM WAV to its first `seconds`. Anything it cannot parse comes back unchanged,
 * with trimmed=false.
 */
export function trimWavToSeconds(
  bytes: Uint8Array,
  seconds: number,
): { bytes: Uint8Array; trimmed: boolean } {
  try {
    if (bytes.byteLength < 44) return { bytes, trimmed: false };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (o: number) =>
      String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
    if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return { bytes, trimmed: false };

    let offset = 12;
    let byteRate = 0;
    let blockAlign = 0;
    while (offset + 8 <= bytes.byteLength) {
      const id = tag(offset);
      const size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (id === "fmt ") {
        byteRate = view.getUint32(body + 8, true);
        blockAlign = view.getUint16(body + 12, true);
      } else if (id === "data") {
        if (byteRate <= 0 || blockAlign <= 0) return { bytes, trimmed: false };
        const available = Math.min(size, bytes.byteLength - body);
        const wanted = Math.floor((seconds * byteRate) / blockAlign) * blockAlign;
        if (available <= wanted) return { bytes, trimmed: false };
        const out = new Uint8Array(body + wanted);
        out.set(bytes.subarray(0, body + wanted));
        const outView = new DataView(out.buffer);
        outView.setUint32(4, out.byteLength - 8, true);
        outView.setUint32(offset + 4, wanted, true);
        return { bytes: out, trimmed: true };
      }
      offset = body + size + (size % 2);
    }
    return { bytes, trimmed: false };
  } catch {
    return { bytes, trimmed: false };
  }
}

function fileFields(json: unknown): { uri: string; name: string; mimeType: string; state: string } | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const file = (root.file && typeof root.file === "object" ? root.file : root) as Record<string, unknown>;
  const uri = typeof file.uri === "string" ? file.uri : "";
  const name = typeof file.name === "string" ? file.name : "";
  if (!uri || !name) return null;
  const mime =
    typeof file.mime_type === "string"
      ? file.mime_type
      : typeof file.mimeType === "string"
        ? file.mimeType
        : "";
  const state = typeof file.state === "string" ? file.state : "";
  return { uri, name, mimeType: mime, state };
}

/** Resumable upload of one file to the Gemini Files API. Throws on any failure. */
export async function uploadAudioToGemini(params: {
  bytes: Uint8Array;
  mimeType: string;
  displayName: string;
  apiKey: string;
  fetchFn?: FetchFn;
  signal?: AbortSignal;
}): Promise<GeminiAudioRef> {
  const f = params.fetchFn ?? fetch;
  const start = await f(UPLOAD_URL, {
    method: "POST",
    signal: params.signal,
    headers: {
      "x-goog-api-key": params.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(params.bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": params.mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: params.displayName } }),
  });
  if (!start.ok) throw new Error(`gemini files start ${start.status}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("gemini files: no upload url");

  const done = await f(uploadUrl, {
    method: "POST",
    signal: params.signal,
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Blob([params.bytes as BlobPart]),
  });
  if (!done.ok) throw new Error(`gemini files upload ${done.status}`);
  let file = fileFields(await done.json().catch(() => null));
  if (!file) throw new Error("gemini files: bad response");

  // Audio is normally ACTIVE at once. If the API reports PROCESSING, wait a little.
  for (let i = 0; i < 8 && file.state === "PROCESSING"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await f(`${FILES_BASE}/${file.name}`, {
      signal: params.signal,
      headers: { "x-goog-api-key": params.apiKey },
    });
    if (!res.ok) throw new Error(`gemini files get ${res.status}`);
    const next = fileFields(await res.json().catch(() => null));
    if (!next) throw new Error("gemini files: bad status response");
    file = next;
  }
  if (file.state === "PROCESSING" || file.state === "FAILED") {
    throw new Error(`gemini files state ${file.state}`);
  }
  return { uri: file.uri, name: file.name, mimeType: file.mimeType || params.mimeType };
}

/** Best effort. Google also removes the file after 48 hours. */
export async function deleteGeminiFile(
  name: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  try {
    await fetchFn(`${FILES_BASE}/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    });
  } catch {
    /* ignore */
  }
}

export type MasterAudio = { bytes: Uint8Array; contentType: string };

/** Active MASTER of a beat, as the level reader in bitek.ts finds it. */
async function loadMasterAudio(beatId: string): Promise<MasterAudio> {
  const [{ createSupabaseAdminClient }, { downloadBeatAudioObjectBytes }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/beats/audio-transport"),
  ]);
  const asset = await createSupabaseAdminClient()
    .from("beat_audio_assets")
    .select("object_key, content_type")
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .maybeSingle();
  const objectKey =
    asset.data && typeof asset.data.object_key === "string" ? asset.data.object_key : "";
  if (asset.error || !objectKey) throw new Error("master not found");
  const contentType =
    asset.data && typeof asset.data.content_type === "string" && asset.data.content_type
      ? asset.data.content_type
      : "audio/wav";
  return { bytes: await downloadBeatAudioObjectBytes(objectKey), contentType };
}

export type PreparedAudio = {
  ref: GeminiAudioRef;
  /** Deletes the uploaded file. Safe to call once, never throws. */
  cleanup: () => Promise<void>;
};

/**
 * Loads the beat's master, cuts it to the first minute or so and uploads it to Gemini.
 * Throws when there is no key, no master, or anything takes longer than the budget.
 */
export async function prepareBeatAudioForGemini(
  beatId: string,
  deps: {
    env?: Record<string, string | undefined>;
    fetchFn?: FetchFn;
    loadMaster?: (beatId: string) => Promise<MasterAudio>;
    timeoutMs?: number;
  } = {},
): Promise<PreparedAudio> {
  const env = deps.env ?? process.env;
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("no gemini key");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? PREPARE_AUDIO_TIMEOUT_MS);
  try {
    const master = await (deps.loadMaster ?? loadMasterAudio)(beatId);
    const isWav = /wav/i.test(master.contentType);
    const cut = isWav ? trimWavToSeconds(master.bytes, COMPARE_AUDIO_SECONDS) : { bytes: master.bytes };
    const mimeType = isWav ? "audio/wav" : master.contentType;
    const ref = await uploadAudioToGemini({
      bytes: cut.bytes,
      mimeType,
      displayName: "generated-beat",
      apiKey,
      fetchFn: deps.fetchFn,
      signal: controller.signal,
    });
    let cleaned = false;
    return {
      ref,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await deleteGeminiFile(ref.name, apiKey, deps.fetchFn);
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The route allows 300 s. Keep a margin and room to start the Stable Audio generation. */
export const REVISE_TOTAL_BUDGET_MS = 285_000;
export const REVISE_START_RESERVE_MS = 35_000;
const AUDIO_DESCRIBE_TIMEOUT_MS = 110_000;
const VIDEO_DESCRIBE_TIMEOUT_MS = 170_000;
/** Below this, another Gemini call has no realistic chance to finish. */
const MIN_USEFUL_WAIT_MS = 30_000;

/**
 * New brief for a revision, in two tries inside one time budget:
 *  1. video + the generated beat's audio + the listener's note
 *  2. video + the note (the earlier method), when 1 fails or there is no time for it
 * Returns null when neither worked, so the caller keeps its text-only revision.
 */
export async function reviseBriefFromVideo(params: {
  beatId: string;
  youtubeUrl: string;
  previousBrief: string;
  note: string;
  /** Date.now() when the whole revise request started. */
  startedAt: number;
  /** Tempo and key measured from the reference file; a revision keeps them. */
  measured?: ReferenceMeasure | null;
  deps?: {
    env?: Record<string, string | undefined>;
    fetchFn?: FetchFn;
    now?: () => number;
    prepare?: typeof prepareBeatAudioForGemini;
    describe?: (url: string, deps: YoutubeStyleDeps, revision: YoutubeRevision) => Promise<BeatStyleFromYouTube>;
  };
}): Promise<{ brief: BeatStyleFromYouTube; usedAudio: boolean } | null> {
  const d = params.deps ?? {};
  const now = d.now ?? Date.now;
  const describe = d.describe ?? describeBeatStyleFromYouTube;
  const prepare = d.prepare ?? prepareBeatAudioForGemini;
  const left = () => REVISE_TOTAL_BUDGET_MS - REVISE_START_RESERVE_MS - (now() - params.startedAt);
  const base: YoutubeStyleDeps = { env: d.env, fetchFn: d.fetchFn, measured: params.measured ?? null };
  const revision = { previousBrief: params.previousBrief, note: params.note };

  if (left() >= PREPARE_AUDIO_TIMEOUT_MS + MIN_USEFUL_WAIT_MS) {
    let prepared: PreparedAudio | null = null;
    try {
      prepared = await prepare(params.beatId, { env: d.env, fetchFn: d.fetchFn });
    } catch (error) {
      console.error("[bitek] audio for gemini failed", error instanceof Error ? error.message : "unknown");
    }
    if (prepared) {
      try {
        const timeoutMs = Math.min(AUDIO_DESCRIBE_TIMEOUT_MS, left());
        if (timeoutMs >= MIN_USEFUL_WAIT_MS) {
          const brief = await describe(params.youtubeUrl, { ...base, timeoutMs }, { ...revision, audio: { uri: prepared.ref.uri, mimeType: prepared.ref.mimeType } });
          return { brief, usedAudio: true };
        }
      } catch (error) {
        console.error("[bitek] audio revision failed", error instanceof Error ? error.message : "unknown");
      } finally {
        await prepared.cleanup();
      }
    }
  }

  const timeoutMs = Math.min(VIDEO_DESCRIBE_TIMEOUT_MS, left());
  if (timeoutMs < MIN_USEFUL_WAIT_MS) return null;
  try {
    const brief = await describe(params.youtubeUrl, { ...base, timeoutMs }, revision);
    return { brief, usedAudio: false };
  } catch (error) {
    console.error("[bitek] video revision failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

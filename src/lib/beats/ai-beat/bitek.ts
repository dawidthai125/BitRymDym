import "server-only";

import { measurePcmLevel } from "@/lib/beats/ai-beat/level";
import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";
import { downloadBeatAudioObjectBytes } from "@/lib/beats/audio-transport";
import { isUuid } from "@/lib/beats/audio-validation";
import { BeatRequestError } from "@/lib/beats/request-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  BITEK_REVIEW_SYSTEM,
  bitekFactsLines,
  nearestBeatDuration,
  revisionDescription,
  type BitekChatTurn,
} from "@/lib/beats/ai-beat/bitek-review";
import { openAiCompatibleProvider, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";
import { requireAdminGenerator, startBeatGeneration } from "@/lib/beats/ai-beat/generate";
import { measureToneFacts, type ToneFacts } from "@/lib/beats/ai-beat/tone-facts";
import { descriptionFromYoutubeStyle, normalizeBeatHintBpm } from "@/lib/beats/ai-beat/prompt";
import { reviseBriefFromVideo } from "@/lib/beats/ai-beat/gemini-audio-compare";
import type { ReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";
import type { StableAudioSampling } from "@/lib/beats/ai-beat/stability";
import { parseYouTubeWatchUrl } from "@/lib/beats/ai-beat/youtube-style";

const NOT_WAITING = "Tego bitu nie ma w katalogu oczekujących.";

type WaitingFactRow = {
  id: string;
  title: string;
  description: string | null;
  style: string | null;
  bpm: number | null;
  duration_seconds: number | null;
  generator_peak_db: number | string | null;
  generator_rms_db: number | string | null;
  ownership_type: string;
  status: string;
  tags: string[] | null;
};

function factsOnlyReply(facts: string, lastUser?: string): string {
  const note = lastUser
    ? "Bitek AI chwilowo nie odpowiada, więc nie umiem odnieść się do Twojej uwagi. Użyj „Weź tę uwagę”, żeby wygenerować nową wersję z poprawką. "
    : "";
  return `${note}Zapisane fakty: ${facts.replace(/\n/g, " ")}`;
}

function bitekChatProviders(env: Record<string, string | undefined> = process.env): BitekLlmProvider[] {
  const base = { maxTokens: 700, temperature: 0.3 };
  const list: BitekLlmProvider[] = [];
  const xai = env.XAI_API_KEY?.trim();
  const groq = env.GROQ_API_KEY?.trim();
  const gemini = env.GEMINI_API_KEY?.trim();
  if (xai) list.push(openAiCompatibleProvider({ ...base, id: "xai", baseUrl: "https://api.x.ai/v1", apiKey: xai, model: env.BITEK_XAI_MODEL || "grok-4.7", reasoningEffort: "low", timeoutMs: 11_000 }));
  if (groq) list.push(openAiCompatibleProvider({ ...base, id: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: groq, model: env.BITEK_GROQ_MODEL || "openai/gpt-oss-20b", reasoningEffort: "low", timeoutMs: 7_000 }));
  if (gemini) list.push(openAiCompatibleProvider({ ...base, id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: gemini, model: env.BITEK_GEMINI_MODEL || "gemini-3.5-flash-lite", reasoningEffort: "low", timeoutMs: 11_000 }));
  return list;
}

function dbOf(value: number | string | null | undefined): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** Older drafts have no stored level. Measure the master once and keep it. */
async function ensureStoredLevel(row: WaitingFactRow): Promise<{ peakDb: number | null; rmsDb: number | null }> {
  const storedPeak = dbOf(row.generator_peak_db);
  const storedRms = dbOf(row.generator_rms_db);
  if (storedPeak != null && storedRms != null) {
    return { peakDb: storedPeak, rmsDb: storedRms };
  }
  try {
    const admin = createSupabaseAdminClient();
    const asset = await admin
      .from("beat_audio_assets")
      .select("object_key, content_type")
      .eq("beat_id", row.id)
      .eq("purpose", "MASTER")
      .eq("is_active", true)
      .maybeSingle();
    const objectKey =
      asset.data && typeof asset.data.object_key === "string" ? asset.data.object_key : "";
    if (asset.error || !objectKey) return { peakDb: storedPeak, rmsDb: storedRms };
    const bytes = await downloadBeatAudioObjectBytes(objectKey);
    const contentType =
      asset.data && typeof asset.data.content_type === "string"
        ? asset.data.content_type
        : "audio/wav";
    const decoded = await decodeAudioToMonoPcm({ bytes, contentType });
    if (!decoded.ok) return { peakDb: storedPeak, rmsDb: storedRms };
    const level = measurePcmLevel(decoded.samples);
    const saved = await admin
      .from("beats")
      .update({
        generator_peak_db: level.peakDb,
        generator_rms_db: level.rmsDb,
      })
      .eq("id", row.id);
    if (saved.error) console.error("[ai-beat] level not stored", saved.error.message);
    return { peakDb: level.peakDb, rmsDb: level.rmsDb };
  } catch (error) {
    console.error(
      "[ai-beat] level unread",
      error instanceof Error ? error.name : "unknown",
    );
    return { peakDb: storedPeak, rmsDb: storedRms };
  }
}

const toneCache = new Map<string, ToneFacts | null>();

/** Spectrum, dynamics and key of the stored master. Best effort; a miss never blocks the chat. */
async function measureStoredTone(beatId: string): Promise<ToneFacts | null> {
  if (toneCache.has(beatId)) return toneCache.get(beatId) ?? null;
  try {
    const admin = createSupabaseAdminClient();
    const asset = await admin
      .from("beat_audio_assets")
      .select("object_key, content_type")
      .eq("beat_id", beatId)
      .eq("purpose", "MASTER")
      .eq("is_active", true)
      .maybeSingle();
    const objectKey =
      asset.data && typeof asset.data.object_key === "string" ? asset.data.object_key : "";
    if (asset.error || !objectKey) return null;
    const bytes = await downloadBeatAudioObjectBytes(objectKey);
    const contentType =
      asset.data && typeof asset.data.content_type === "string"
        ? asset.data.content_type
        : "audio/wav";
    const decoded = await decodeAudioToMonoPcm({ bytes, contentType });
    if (!decoded.ok) return null;
    const tone = measureToneFacts(decoded.samples, decoded.sampleRate);
    if (toneCache.size >= 40) toneCache.delete(toneCache.keys().next().value as string);
    toneCache.set(beatId, tone);
    return tone;
  } catch (error) {
    console.error("[bitek] tone unread", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

async function loadWaitingGeneratedBeat(beatId: string): Promise<WaitingFactRow> {
  await requireAdminGenerator();
  if (!isUuid(beatId)) throw new BeatRequestError(NOT_WAITING);

  const { data, error } = await createSupabaseAdminClient()
    .from("beats")
    .select(
      "id, title, description, style, bpm, duration_seconds, generator_peak_db, generator_rms_db, ownership_type, status, tags",
    )
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = (data as WaitingFactRow | null) ?? null;
  if (
    !row ||
    row.ownership_type !== "PLATFORM" ||
    row.status !== "DRAFT" ||
    !Array.isArray(row.tags) ||
    !row.tags.includes(GENERATED_BEAT_TAG)
  ) {
    throw new BeatRequestError(NOT_WAITING);
  }
  return row;
}

/** Polish reply from stored facts plus peak and average level. No instrument names. */
export async function talkAboutWaitingBeat(
  beatId: string,
  messages: readonly BitekChatTurn[],
): Promise<string> {
  const row = await loadWaitingGeneratedBeat(beatId);
  const [level, tone] = await Promise.all([ensureStoredLevel(row), measureStoredTone(row.id)]);
  const facts = bitekFactsLines({
    title: row.title,
    style: row.style,
    opis: row.description,
    bpm: row.bpm,
    durationSeconds: row.duration_seconds,
    peakDb: level.peakDb,
    rmsDb: level.rmsDb,
    tone,
  }).join("\n");
  if (messages.length === 0) {
    throw new BeatRequestError("Napisz pytanie do Bitka.");
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  const prompt = [
    { role: "system" as const, content: `${BITEK_REVIEW_SYSTEM}\n\nFakty:\n${facts}` },
    ...messages,
  ];
  // xAI -> Groq -> Gemini; the next one is tried when one fails or times out.
  const providers = bitekChatProviders();
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const content = await provider.complete(prompt, controller.signal);
      const reply = content.replace(/\s+/g, " ").trim().slice(0, 1200);
      if (reply) return reply;
    } catch (error) {
      console.error(
        "[bitek] provider failed",
        provider.id,
        error instanceof Error ? error.message : "unknown",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return factsOnlyReply(facts, lastUser);
}

/**
 * Starts a new draft from the stored description plus the fix note.
 * The beat this was called on is left as it is.
 */
export async function reviseWaitingBeat(
  beatId: string,
  note: string,
  source?: {
    youtubeUrl?: string | null;
    brief?: string | null;
    measured?: ReferenceMeasure | null;
    /** Seed and strictness of the beat being fixed: only the prompt changes. */
    sampling?: Partial<StableAudioSampling>;
  },
) {
  const startedAt = Date.now();
  const row = await loadWaitingGeneratedBeat(beatId);
  const cleanNote = note.replace(/\s+/g, " ").trim();
  const hinted = normalizeBeatHintBpm(row.bpm);
  let bpm = hinted === "invalid" ? null : hinted;
  const previous = (source?.brief ?? "").replace(/\s+/g, " ").trim() || (row.description ?? "");

  let description = revisionDescription(previous, cleanNote);
  const url = parseYouTubeWatchUrl(source?.youtubeUrl ?? "");
  if (url && cleanNote) {
    // Back to the video, now also with the generated audio: Gemini compares the two and fixes the gap.
    // Any failure falls back to the video-only revision, then to the text-only one above.
    const revised = await reviseBriefFromVideo({
      beatId,
      youtubeUrl: url,
      previousBrief: previous,
      note: cleanNote,
      startedAt,
      measured: source?.measured ?? null,
    });
    console.log("[bitek] revise path", revised ? (revised.usedAudio ? "video+audio" : "video-only") : "text-only");
    if (revised) {
      description = descriptionFromYoutubeStyle(revised.brief);
      if (revised.brief.bpmHint != null) bpm = revised.brief.bpmHint;
    }
  }
  if (!description) {
    throw new BeatRequestError(
      "Napisz, co zmienić. Opis z poprawką musi mieć od 8 do 800 znaków.",
    );
  }
  const started = await startBeatGeneration({
    description,
    duration: nearestBeatDuration(row.duration_seconds),
    bpm,
    sampling: source?.sampling,
  });
  return { ...started, description, bpm };
}

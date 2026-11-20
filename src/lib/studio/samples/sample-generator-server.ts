import "server-only";

import { requireRole } from "@/lib/auth/session";
import { pollBeatGeneration } from "@/lib/beats/ai-beat/generate";
import { loadMasterAudio } from "@/lib/beats/ai-beat/gemini-audio-compare";
import { estimateTempo } from "@/lib/beats/ai-beat/reference-tempo-dsp";
import {
  STABLE_AUDIO_MODEL,
  STABLE_AUDIO_START_URL,
  parseStabilityStart,
  randomStableAudioSeed,
} from "@/lib/beats/ai-beat/stability";
import { beatKeyDetectedLabel, detectBeatKeyFromMonoPcm, KEY_SUGGEST_MIN_CONFIDENCE } from "@/lib/beats/audio-key";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";
import { BeatRequestError } from "@/lib/beats/request-error";
import {
  buildSamplePrompt,
  checkSampleRequest,
  decodeWav16,
  generationSeconds,
  hzToNoteName,
  noteNameToHz,
  oneShotFundamentalHz,
  oneShotNote,
  retuneOneShot,
  shapeLoop,
  shapeOneShot,
  type SampleGenRequest,
} from "@/lib/studio/samples/sample-generator";
import { encodeWav16 } from "@/lib/studio/samples/sample-lab-dsp";
import { instrumentKind, SAMPLE_MAX_COUNT, STUDIO_SAMPLES_TABLE } from "@/lib/studio/samples/sample-policy";
import { createStudioSample, type StudioSampleDto } from "@/lib/studio/samples/sample-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Stricter prompt adherence for a single, named instrument (stable-audio-3, default 1). */
const SAMPLE_CFG_SCALE = 4;

export async function startSampleGeneration(req: SampleGenRequest): Promise<{ generationId: string; seed: number; prompt: string }> {
  await requireRole(["ADMIN"]);
  const problem = checkSampleRequest(req);
  if (problem) throw new BeatRequestError(problem);
  const key = process.env.STABILITY_API_KEY?.trim();
  if (!key) throw new BeatRequestError("Brak klucza Stability AI na serwerze.");
  const prompt = buildSamplePrompt(req);
  const seed = randomStableAudioSeed();
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("model", STABLE_AUDIO_MODEL);
  form.set("duration", String(generationSeconds(req)));
  form.set("output_format", "wav");
  form.set("seed", String(seed));
  form.set("cfg_scale", String(SAMPLE_CFG_SCALE));
  let res: Response;
  try {
    res = await fetch(STABLE_AUDIO_START_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "stability-client-id": "BitRymDym" },
      body: form,
    });
  } catch {
    throw new BeatRequestError("Nie udało się połączyć z modelem. Spróbuj jeszcze raz.");
  }
  const started = parseStabilityStart(res.status, await res.json().catch(() => null));
  if (!started.ok) throw new BeatRequestError(started.message);
  return { generationId: started.id, seed, prompt };
}

export type GeneratedSample = {
  sample: StudioSampleDto;
  measured: { key: string | null; bpm: number | null; retunedFrom?: string | null };
};

/**
 * Pending until Stability is done; then shape, measure and save one PRIVATE sample owned by
 * the admin. It enters the catalog only when the admin publishes it.
 */
export async function finishSampleGeneration(params: {
  generationId: string;
  req: SampleGenRequest;
  title: string;
  beatId: string | null;
}): Promise<{ status: "pending" } | ({ status: "ready" } & GeneratedSample)> {
  const context = await requireRole(["ADMIN"]);
  const polled = await pollBeatGeneration(params.generationId);
  if (polled.status === "pending") return { status: "pending" };
  if (polled.status !== "ready") throw new BeatRequestError(polled.message);

  const wav = decodeWav16(polled.bytes);
  if (!wav) throw new BeatRequestError("Model oddał plik w nieznanym formacie.");
  const { req } = params;
  let shaped =
    req.type === "loop" && req.bpm && req.bars
      ? shapeLoop(wav.channels, wav.sampleRate, req.bpm, req.bars)
      : shapeOneShot(wav.channels, wav.sampleRate);
  if (!shaped) throw new BeatRequestError("Z wygenerowanego dźwięku nie dało się wyciąć sampla. Spróbuj jeszcze raz.");

  const monoOf = (chs: Float32Array[]) => {
    const m = new Float32Array(chs[0]!.length);
    for (const ch of chs) for (let i = 0; i < m.length; i++) m[i] += ch[i]! / chs.length;
    return m;
  };
  let mono = monoOf(shaped);
  let measuredKey: string | null = null;
  let retunedFrom: string | null = null;
  if (req.preset.pitched) {
    if (req.type === "oneshot") {
      // A one-shot is tuned to the note asked for (Stable Audio gave G1 for F1 live).
      const target = req.key ? noteNameToHz(req.key) : null;
      const f0 = oneShotFundamentalHz(mono, wav.sampleRate);
      const retuned = target && f0 ? retuneOneShot(shaped, f0, target) : null;
      if (retuned && retuned !== shaped) {
        retunedFrom = hzToNoteName(f0!);
        shaped = shapeOneShot(retuned, wav.sampleRate) ?? retuned;
        mono = monoOf(shaped);
      }
      measuredKey = oneShotNote(mono, wav.sampleRate);
    } else {
      const k = detectBeatKeyFromMonoPcm(mono, wav.sampleRate);
      measuredKey = k && k.confidence >= KEY_SUGGEST_MIN_CONFIDENCE ? beatKeyDetectedLabel(k) : null;
    }
  }
  const measuredBpm = req.type === "loop" ? estimateTempo(mono, wav.sampleRate)?.bpm ?? null : null;

  const created = await createStudioSample(context, {
    title: params.title,
    kind: instrumentKind(req.preset.instrument),
    instrument: req.preset.instrument,
    rightsAccepted: true,
    bytes: encodeWav16(shaped, wav.sampleRate),
    declaredContentType: "audio/wav",
    cap: SAMPLE_MAX_COUNT,
    meta: {
      sampleType: req.type,
      bpm: req.type === "loop" ? req.bpm : null,
      // What the file holds wins over what was asked for; a one-shot keeps its note.
      musicalKey: measuredKey ?? (req.preset.pitched ? req.key : null),
      bars: req.type === "loop" ? req.bars : null,
      source: "studio",
      beatId: params.beatId,
    },
  });
  if (!created.ok) {
    throw new BeatRequestError(
      created.error === "SAMPLE_CAP" ? "Konto admina ma już 100 sampli. Usuń zbędne w katalogu." : "Nie udało się zapisać sampla.",
    );
  }
  return { status: "ready", sample: created.sample, measured: { key: measuredKey, bpm: measuredBpm, retunedFrom } };
}

/** The admin's generated sample goes into the public catalog. */
export async function publishGeneratedSample(sampleId: string): Promise<void> {
  const context = await requireRole(["ADMIN"]);
  const { error } = await createSupabaseAdminClient()
    .from(STUDIO_SAMPLES_TABLE)
    .update({ status: "PUBLISHED", public_listing: true, updated_at: new Date().toISOString() })
    .eq("id", sampleId)
    .eq("owner_id", context.userId);
  if (error) throw new BeatRequestError("Nie udało się wydać sampla.");
}

/** Tempo and key of a catalog beat for "under this beat". The key is measured from its master. */
export async function beatTempoAndKey(beatId: string): Promise<{ bpm: number | null; key: string | null }> {
  await requireRole(["ADMIN"]);
  const { data } = await createSupabaseAdminClient().from("beats").select("bpm").eq("id", beatId).maybeSingle();
  const bpm = data?.bpm == null ? null : Math.round(Number(data.bpm));
  let key: string | null = null;
  try {
    const master = await loadMasterAudio(beatId);
    const decoded = await decodeAudioToMonoPcm({ bytes: master.bytes, contentType: master.contentType });
    if (decoded.ok) {
      const k = detectBeatKeyFromMonoPcm(decoded.samples, decoded.sampleRate);
      key = k && k.confidence >= KEY_SUGGEST_MIN_CONFIDENCE ? beatKeyDetectedLabel(k) : null;
    }
  } catch {
    key = null;
  }
  return { bpm, key };
}

import "server-only";

import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";
import { measurePcmLevel } from "@/lib/beats/ai-beat/level";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  analyzePlatformBeatPendingUpload,
  createPlatformBeatSignedUploadSession,
  finalizePlatformBeatAfterUpload,
} from "@/lib/beats/audio-transport";
import { BEAT_AUDIO_BUCKET, BEAT_AUDIO_MAX_BYTES } from "@/lib/beats/audio-validation";
import { BeatRequestError } from "@/lib/beats/request-error";
import { deleteBeat } from "@/lib/beats/service";
import { BEAT_DURATION_MAX } from "@/lib/beats/validation";
import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import {
  pickGeneratedBpm,
  sanitizeBeatOpis,
  sanitizeBeatStyle,
  sanitizeBeatTitle,
} from "@/lib/beats/ai-beat/prompt";
import type { AudioFileKind } from "@/lib/beats/ai-beat/stability";

export type IngestGeneratedBeatResult = {
  beatId: string;
  bpm: number;
};

/**
 * Puts a generated instrumental through the same master path as an uploaded file:
 * draft, private storage, tempo read, then a draft ready to publish.
 */
export async function ingestGeneratedBeat(params: {
  bytes: Uint8Array;
  contentType: AudioFileKind;
  title: string;
  description: string;
  style?: string | null;
  styleDescription?: string | null;
  bpmHint: number | null;
}): Promise<IngestGeneratedBeatResult> {
  if (params.bytes.byteLength > BEAT_AUDIO_MAX_BYTES) {
    throw new BeatRequestError("Wygenerowany plik jest za duży.");
  }

  const filename = params.contentType === "audio/mpeg" ? "bitrymdym-ai.mp3" : "bitrymdym-ai.wav";
  const session = await createPlatformBeatSignedUploadSession({
    contentType: params.contentType,
    byteSize: params.bytes.byteLength,
    originalFilename: filename,
  });

  try {
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from(BEAT_AUDIO_BUCKET)
      .upload(session.objectKey, Buffer.from(params.bytes), {
        contentType: params.contentType,
        upsert: false,
      });
    if (uploadError) {
      throw new BeatRequestError("Nie udało się zapisać pliku bitu.");
    }

    const analyzed = await analyzePlatformBeatPendingUpload({
      beatId: session.beatId,
      assetId: session.assetId,
    });
    if (analyzed.durationSeconds > BEAT_DURATION_MAX) {
      throw new BeatRequestError("Wygenerowany bit jest za długi.");
    }

    const picked = pickGeneratedBpm(analyzed.bpmEnvelope, params.bpmHint);
    if (!picked) {
      throw new BeatRequestError("Nie udało się odczytać tempa tego bitu. Spróbuj jeszcze raz.");
    }

    await finalizePlatformBeatAfterUpload({
      beatId: session.beatId,
      assetId: session.assetId,
      title: sanitizeBeatTitle(params.title),
      producer: "BitRymDym",
      description: sanitizeBeatOpis(params.styleDescription) ?? params.description,
      genre: "Hip-hop",
      style: sanitizeBeatStyle(params.style),
      bpm: picked.bpm,
      bpmSelectionMode: picked.mode,
      tags: ["hip-hop", "instrumental", GENERATED_BEAT_TAG],
    });

    await storeGeneratedLevel(session.beatId, params.bytes, params.contentType);
    return { beatId: session.beatId, bpm: picked.bpm };
  } catch (error) {
    await deleteBeat(session.beatId).catch(() => undefined);
    if (error instanceof BeatRequestError) throw error;
    throw new BeatRequestError("Nie udało się zapisać bitu. Spróbuj jeszcze raz.");
  }
}

/** Best effort. A failed level read must not delete the draft. */
async function storeGeneratedLevel(
  beatId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  try {
    const decoded = await decodeAudioToMonoPcm({ bytes, contentType });
    if (!decoded.ok) return;
    const level = measurePcmLevel(decoded.samples);
    const { error } = await createSupabaseAdminClient()
      .from("beats")
      .update({
        generator_peak_db: level.peakDb,
        generator_rms_db: level.rmsDb,
      })
      .eq("id", beatId);
    if (error) console.error("[ai-beat] level not stored", error.message);
  } catch (error) {
    console.error(
      "[ai-beat] level not stored",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

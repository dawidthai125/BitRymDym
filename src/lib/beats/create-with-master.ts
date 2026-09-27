"use server";

import { revalidatePath } from "next/cache";

import { AuthError, requirePermission } from "@/lib/auth/session";
import { finalizePlatformBeatAfterUpload } from "@/lib/beats/audio-transport";
import type { BeatBpmAnalysis } from "@/lib/beats/bpm-ensemble";

export type CreateWithMasterActionState = {
  error: string | null;
  success: boolean;
  beatId?: string;
};

function catchCreate(error: unknown): CreateWithMasterActionState {
  if (error instanceof AuthError) {
    return { error: error.message, success: false };
  }
  return {
    error: error instanceof Error ? error.message : "Beat action failed.",
    success: false,
  };
}

function revalidateBeatSurfaces(beatId?: string) {
  revalidatePath("/");
  revalidatePath("/beats");
  revalidatePath("/admin/beats");
  if (beatId) {
    revalidatePath(`/admin/beats/${beatId}`);
    revalidatePath(`/beat/${beatId}`);
  }
}

export type AnalyzeBeatAudioResult = {
  error: string | null;
  success: boolean;
  durationSeconds?: number;
  byteSize?: number;
  contentType?: string;
  titleSuggestion?: string;
  bpm?: number;
  bpmDecision?: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
  bpmReason?: string;
  bpmUnavailable?: boolean;
  bpmMessage?: string;
  bpmAnalysis?: BeatBpmAnalysis;
};

/**
 * @deprecated Base64 analyze removed — use POST /api/admin/beats/audio/session + analyze.
 */
export async function analyzeAdminBeatAudioAction(_params: {
  base64: string;
  contentType: string;
  originalFilename?: string | null;
}): Promise<AnalyzeBeatAudioResult> {
  void _params;
  return {
    error:
      "Użyj binary upload (signed Storage). Base64 Server Action jest wyłączone.",
    success: false,
  };
}

/**
 * Finalize DRAFT after signed binary upload + analyze.
 * JSON only — no audio body (BPM revalidation downloads from Storage).
 */
export async function finalizePlatformBeatWithMasterAction(params: {
  beatId: string;
  assetId: string;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  bpmManualOverride?: boolean;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<CreateWithMasterActionState> {
  try {
    await requirePermission("beats.create");
    const result = await finalizePlatformBeatAfterUpload({
      beatId: params.beatId,
      assetId: params.assetId,
      title: params.title,
      producer: params.producer,
      description: params.description,
      genre: params.genre,
      style: params.style,
      bpm: params.bpm,
      bpmManualOverride: params.bpmManualOverride,
      key: params.key,
      scale: params.scale,
      tags: params.tags,
      coverRef: params.coverRef,
    });
    revalidateBeatSurfaces(result.beatId);
    return { error: null, success: true, beatId: result.beatId };
  } catch (error) {
    return catchCreate(error);
  }
}

/**
 * @deprecated Base64 create removed — use signed upload session + finalizePlatformBeatWithMasterAction.
 */
export async function createPlatformBeatWithMasterAction(params: {
  base64: string;
  contentType: string;
  originalFilename?: string | null;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  bpmManualOverride?: boolean;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<CreateWithMasterActionState> {
  void params;
  return {
    error:
      "Użyj binary upload (signed Storage). Base64 Server Action jest wyłączone.",
    success: false,
  };
}

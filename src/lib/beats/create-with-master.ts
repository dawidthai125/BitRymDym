"use server";

import { revalidatePath } from "next/cache";

import { AuthError, requirePermission } from "@/lib/auth/session";
import { resolveCreateBpm } from "@/lib/beats/audio-bpm-rank";
import { analyzeBeatAudioBytes } from "@/lib/beats/audio-duration";
import { uploadPlatformBeatAudio } from "@/lib/beats/audio-service";
import { createPlatformBeat } from "@/lib/beats/service";
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
  /** Present when AUTO_SUGGEST. */
  bpm?: number;
  bpmDecision?: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
  bpmReason?: string;
  bpmUnavailable?: boolean;
  bpmMessage?: string;
  /** Internal diagnostics — not shown as accuracy claims. */
  bpmAnalysis?: BeatBpmAnalysis;
};

/**
 * ADMIN-only: probe uploaded bytes for duration + BPM ensemble + title suggestion.
 * Does not create a beat or write storage.
 */
export async function analyzeAdminBeatAudioAction(params: {
  base64: string;
  contentType: string;
  originalFilename?: string | null;
}): Promise<AnalyzeBeatAudioResult> {
  try {
    await requirePermission("beats.create");
    const bytes = Uint8Array.from(Buffer.from(params.base64, "base64"));
    const analyzed = await analyzeBeatAudioBytes({
      bytes,
      contentType: params.contentType,
      originalFilename: params.originalFilename,
    });
    if (!analyzed.ok) {
      return { error: analyzed.error, success: false };
    }

    const base: AnalyzeBeatAudioResult = {
      error: null,
      success: true,
      durationSeconds: analyzed.durationSeconds,
      byteSize: analyzed.byteSize,
      contentType: analyzed.contentType,
      titleSuggestion: analyzed.titleSuggestion,
    };

    if (analyzed.bpm.status === "auto_suggest") {
      return {
        ...base,
        bpm: analyzed.bpm.bpm,
        bpmDecision: "AUTO_SUGGEST",
        bpmReason: analyzed.bpm.reason,
        bpmUnavailable: false,
        bpmAnalysis: analyzed.bpm.analysis,
      };
    }

    if (analyzed.bpm.status === "manual_required") {
      return {
        ...base,
        bpmDecision: "MANUAL_REQUIRED",
        bpmReason: analyzed.bpm.reason,
        bpmUnavailable: true,
        bpmMessage: analyzed.bpm.message,
        bpmAnalysis: analyzed.bpm.analysis,
      };
    }

    return {
      ...base,
      bpmDecision: "MANUAL_REQUIRED",
      bpmReason: analyzed.bpm.reason,
      bpmUnavailable: true,
      bpmMessage: analyzed.bpm.message,
      bpmAnalysis: analyzed.bpm.analysis,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.message, success: false };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Analiza audio nie powiodła się.",
      success: false,
    };
  }
}

/**
 * Create PLATFORM DRAFT with server duration + BPM ensemble policy, then MASTER upload.
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
  /** Operator explicitly changed BPM from auto suggestion (or filled manual). */
  bpmManualOverride?: boolean;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<CreateWithMasterActionState> {
  try {
    await requirePermission("beats.create");

    const bytes = Uint8Array.from(Buffer.from(params.base64, "base64"));
    const analyzed = await analyzeBeatAudioBytes({
      bytes,
      contentType: params.contentType,
      originalFilename: params.originalFilename,
    });
    if (!analyzed.ok) {
      return { error: analyzed.error, success: false };
    }

    const suggestedBpm =
      analyzed.bpm.status === "auto_suggest" ? analyzed.bpm.bpm : null;
    // Decode ran for WAV/MP3 even when MANUAL_REQUIRED (ensemble abstained).
    const decodeAvailable =
      analyzed.bpm.status === "auto_suggest" ||
      analyzed.bpm.status === "manual_required";

    const bpmResolved = resolveCreateBpm({
      clientBpm: params.bpm,
      bpmManualOverride: Boolean(params.bpmManualOverride),
      suggestedBpm,
      decodeAvailable,
    });
    if (!bpmResolved.ok) {
      return { error: bpmResolved.error, success: false };
    }

    const beat = await createPlatformBeat({
      title: params.title,
      producer: params.producer ?? null,
      description: params.description ?? null,
      genre: params.genre ?? null,
      style: params.style ?? null,
      bpm: bpmResolved.bpm,
      key: params.key ?? null,
      scale: params.scale ?? null,
      durationSeconds: analyzed.durationSeconds,
      tags: params.tags ?? [],
      coverRef: params.coverRef ?? null,
      status: "DRAFT",
    });

    await uploadPlatformBeatAudio({
      beatId: beat.id,
      purpose: "MASTER",
      bytes,
      contentType: analyzed.contentType,
      originalFilename: params.originalFilename,
    });

    revalidateBeatSurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchCreate(error);
  }
}

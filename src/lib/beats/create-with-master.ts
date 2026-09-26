"use server";

import { revalidatePath } from "next/cache";

import { AuthError, requirePermission } from "@/lib/auth/session";
import { analyzeBeatAudioBytes } from "@/lib/beats/audio-duration";
import { uploadPlatformBeatAudio } from "@/lib/beats/audio-service";
import { createPlatformBeat } from "@/lib/beats/service";

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
};

/**
 * ADMIN-only: probe uploaded bytes for duration + title suggestion.
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
    return {
      error: null,
      success: true,
      durationSeconds: analyzed.durationSeconds,
      byteSize: analyzed.byteSize,
      contentType: analyzed.contentType,
      titleSuggestion: analyzed.titleSuggestion,
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
 * Scope A: create PLATFORM DRAFT using server-probed duration, then upload MASTER
 * via existing uploadPlatformBeatAudio (single storage write).
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

    // BPM: required integer 1–300 — validated again inside createPlatformBeat.
    if (
      typeof params.bpm !== "number" ||
      !Number.isInteger(params.bpm) ||
      Number.isNaN(params.bpm)
    ) {
      return { error: "BPM jest wymagane (1–300).", success: false };
    }

    const beat = await createPlatformBeat({
      title: params.title,
      producer: params.producer ?? null,
      description: params.description ?? null,
      genre: params.genre ?? null,
      style: params.style ?? null,
      bpm: params.bpm,
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

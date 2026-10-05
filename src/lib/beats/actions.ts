"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/lib/auth/session";
import {
  archiveBeat,
  deleteBeat,
  listPublishedBeats,
  transitionBeatStatus,
  updateBeatMetadata,
} from "@/lib/beats/service";
import { toUserFacingError } from "@/lib/ui/user-errors";
import type { BeatStatus } from "@/types/domain";

export type BeatActionState = {
  error: string | null;
  success: boolean;
  beatId?: string;
};

function catchAction(error: unknown): BeatActionState {
  if (error instanceof AuthError) {
    return {
      error: toUserFacingError(error.message, "generic"),
      success: false,
    };
  }
  return {
    error: toUserFacingError(
      error instanceof Error ? error.message : null,
      "generic",
    ),
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

function optionalFormText(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

function parseTags(formData: FormData): string[] {
  return String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Legacy FormData create (client duration) — DISABLED (Scope A).
 * duration_seconds must come from server audio probe via
 * createPlatformBeatWithMasterAction. Do not re-enable FormData duration.
 */
export async function createPlatformBeatAction(
  _prev: BeatActionState,
  _formData: FormData,
): Promise<BeatActionState> {
  void _formData;
  return {
    error:
      "Utwórz bit przez przepływ audio-first (plik Master wymagany; czas z serwera).",
    success: false,
  };
}

export async function publishBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await transitionBeatStatus(beatId, "PUBLISHED");
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function archiveBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await archiveBeat(beatId);
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function restoreArchivedBeatAction(
  beatId: string,
): Promise<BeatActionState> {
  try {
    await transitionBeatStatus(beatId, "DRAFT");
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function deleteBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await deleteBeat(beatId);
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function updateBeatMetadataAction(
  _prev: BeatActionState,
  formData: FormData,
): Promise<BeatActionState> {
  const beatId = String(formData.get("beatId") ?? "");
  try {
    if (!beatId) {
      return { error: "Missing beat id.", success: false };
    }
    await updateBeatMetadata(beatId, {
      title: String(formData.get("title") ?? ""),
      producer: optionalFormText(formData, "producer"),
      description: optionalFormText(formData, "description"),
      genre: optionalFormText(formData, "genre"),
      style: optionalFormText(formData, "style"),
      bpm: Number(formData.get("bpm")),
      key: optionalFormText(formData, "key"),
      scale: optionalFormText(formData, "scale"),
      // Duration is server-probed from MASTER audio (Scope A) — not editable here.
      tags: parseTags(formData),
      coverRef: optionalFormText(formData, "coverRef"),
    });
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function transitionBeatStatusAction(
  beatId: string,
  to: BeatStatus,
): Promise<BeatActionState> {
  try {
    await transitionBeatStatus(beatId, to);
    revalidateBeatSurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function getPublishedBeatsAction() {
  return listPublishedBeats();
}

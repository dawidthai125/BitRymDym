"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/lib/auth/session";
import {
  archiveBeat,
  createPlatformBeat,
  deleteBeat,
  listPublishedBeats,
  transitionBeatStatus,
  updateBeatMetadata,
} from "@/lib/beats/service";
import type { BeatStatus } from "@/types/domain";

export type BeatActionState = {
  error: string | null;
  success: boolean;
  beatId?: string;
};

function catchAction(error: unknown): BeatActionState {
  if (error instanceof AuthError) {
    return { error: error.message, success: false };
  }
  return {
    error: error instanceof Error ? error.message : "Beat action failed.",
    success: false,
  };
}

export async function createPlatformBeatAction(
  _prev: BeatActionState,
  formData: FormData,
): Promise<BeatActionState> {
  try {
    const beat = await createPlatformBeat({
      title: String(formData.get("title") ?? ""),
      producer: String(formData.get("producer") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      genre: String(formData.get("genre") ?? "") || null,
      style: String(formData.get("style") ?? "") || null,
      bpm: Number(formData.get("bpm")),
      key: String(formData.get("key") ?? "") || null,
      scale: String(formData.get("scale") ?? "") || null,
      durationSeconds: Number(formData.get("durationSeconds")),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      coverRef: String(formData.get("coverRef") ?? "") || null,
      status: "DRAFT",
    });
    revalidatePath("/");
    revalidatePath("/beats");
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function publishBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await transitionBeatStatus(beatId, "PUBLISHED");
    revalidatePath("/");
    revalidatePath("/beats");
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function archiveBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await archiveBeat(beatId);
    revalidatePath("/");
    revalidatePath("/beats");
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
    revalidatePath("/");
    revalidatePath("/beats");
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function deleteBeatAction(beatId: string): Promise<BeatActionState> {
  try {
    await deleteBeat(beatId);
    revalidatePath("/");
    revalidatePath("/beats");
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function updateBeatMetadataAction(
  beatId: string,
  patch: {
    title?: string;
    bpm?: number;
    durationSeconds?: number;
  },
): Promise<BeatActionState> {
  try {
    await updateBeatMetadata(beatId, patch);
    revalidatePath("/");
    revalidatePath("/beats");
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
    revalidatePath("/");
    revalidatePath("/beats");
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function getPublishedBeatsAction() {
  return listPublishedBeats();
}

"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { beatActionErrorMessage } from "@/lib/beats/beat-operation-error";
import { reviewBeatCover } from "@/lib/beats/cover/cover-service";
import { parseOwnerBeatSettings } from "@/lib/beats/owner-edit-policy";
import { BeatRequestError } from "@/lib/beats/request-error";
import { patchOwnUserBeatAfterAuthz } from "@/lib/beats/service";

export type OwnerEditActionState = {
  error: string | null;
  success: boolean;
};

function revalidateBeatSurfaces(beatId: string) {
  revalidatePath("/");
  revalidatePath("/beats");
  revalidatePath("/account/beats");
  revalidatePath(`/account/beats/${beatId}/edit`);
  revalidatePath(`/beat/${beatId}`);
  revalidatePath("/admin/moderation");
}

/**
 * User beats 2026-10-30 — owner saves metadata + usage settings
 * (also after publish; no re-moderation).
 */
export async function updateOwnBeatAction(params: {
  beatId: string;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  settings?: unknown;
}): Promise<OwnerEditActionState> {
  try {
    const context = await requireUser();
    const settings = parseOwnerBeatSettings(params.settings);
    if (!settings.ok) throw new BeatRequestError(settings.error);
    await patchOwnUserBeatAfterAuthz({
      context,
      beatId: params.beatId,
      patch: {
        title: params.title,
        producer: params.producer,
        description: params.description,
        genre: params.genre,
        style: params.style,
        bpm: params.bpm,
        key: params.key,
        scale: params.scale,
        tags: params.tags,
      },
      settings: settings.value,
    });
    revalidateBeatSurfaces(params.beatId);
    return { error: null, success: true };
  } catch (error) {
    return {
      error: beatActionErrorMessage(error, "beats/owner-edit-actions"),
      success: false,
    };
  }
}

/** Moderator / admin decision on a cover in the queue. */
export async function reviewBeatCoverAction(params: {
  beatId: string;
  decision: "approve" | "reject";
  reason?: string | null;
}): Promise<OwnerEditActionState> {
  try {
    const context = await requireUser();
    if (params.decision !== "approve" && params.decision !== "reject") {
      throw new BeatRequestError("Nieprawidłowa decyzja.");
    }
    await reviewBeatCover(context, params);
    revalidateBeatSurfaces(params.beatId);
    return { error: null, success: true };
  } catch (error) {
    return {
      error: beatActionErrorMessage(error, "beats/cover-review"),
      success: false,
    };
  }
}

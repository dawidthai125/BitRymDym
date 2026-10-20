"use server";

import { revalidatePath } from "next/cache";

import {
  PROVISIONAL_DRAFT_BPM,
  PROVISIONAL_DRAFT_DURATION_SECONDS,
} from "@/lib/beats/audio-transport";
import { beatActionErrorMessage } from "@/lib/beats/beat-operation-error";
import { requireUser } from "@/lib/auth/session";
import {
  approveUserBeat,
  archiveOwnUserBeat,
  createUserBeat,
  publishApprovedUserBeat,
  rejectUserBeat,
  returnRejectedUserBeatToDraft,
  submitUserBeat,
  updateOwnUserDraftMetadata,
} from "@/lib/beats/service";

export type CommunityActionState = {
  error: string | null;
  success: boolean;
  beatId?: string;
};

function catchAction(error: unknown): CommunityActionState {
  return {
    error: beatActionErrorMessage(error, "beats/community-actions"),
    success: false,
  };
}

function revalidateCommunitySurfaces(beatId?: string) {
  revalidatePath("/account");
  revalidatePath("/account/beats");
  revalidatePath("/beats/upload");
  revalidatePath("/admin/moderation");
  revalidatePath("/beats");
  if (beatId) {
    revalidatePath(`/account/beats/${beatId}`);
    revalidatePath(`/admin/moderation/${beatId}`);
    revalidatePath(`/beat/${beatId}`);
  }
}

/** Create provisional USER DRAFT before signed upload session. */
export async function createUserDraftBeatAction(params?: {
  title?: string;
}): Promise<CommunityActionState> {
  try {
    const beat = await createUserBeat({
      title: (params?.title ?? "Nowy bit").trim() || "Nowy bit",
      bpm: PROVISIONAL_DRAFT_BPM,
      durationSeconds: PROVISIONAL_DRAFT_DURATION_SECONDS,
    });
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function submitUserBeatAction(
  beatId: string,
  options?: { rightsAccepted?: boolean },
): Promise<CommunityActionState> {
  try {
    const beat = await submitUserBeat(beatId, options);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function returnRejectedToDraftAction(
  beatId: string,
): Promise<CommunityActionState> {
  try {
    const beat = await returnRejectedUserBeatToDraft(beatId);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function archiveOwnUserBeatAction(
  beatId: string,
): Promise<CommunityActionState> {
  try {
    const beat = await archiveOwnUserBeat(beatId);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function updateOwnUserBeatMetadataAction(params: {
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
  coverRef?: string | null;
}): Promise<CommunityActionState> {
  try {
    const beat = await updateOwnUserDraftMetadata(params.beatId, {
      title: params.title,
      producer: params.producer,
      description: params.description,
      genre: params.genre,
      style: params.style,
      bpm: params.bpm,
      key: params.key,
      scale: params.scale,
      tags: params.tags,
      coverRef: params.coverRef,
    });
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function approveUserBeatAction(
  beatId: string,
): Promise<CommunityActionState> {
  try {
    const beat = await approveUserBeat(beatId);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function rejectUserBeatAction(
  beatId: string,
  rejectionReason: string,
): Promise<CommunityActionState> {
  try {
    const beat = await rejectUserBeat(beatId, rejectionReason);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

export async function closeOpenRightsReviewAction(
  reviewId: string,
  outcome: "dismissed_no_publish" | "still_blocked" | "needs_new_master",
  reason: string,
): Promise<CommunityActionState> {
  try {
    await requireUser();
    const { closeOpenRightsReview } = await import("@/lib/beats/rights-records");
    const beatId = await closeOpenRightsReview({ reviewId, outcome, reason });
    revalidateCommunitySurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function publishApprovedUserBeatAction(
  beatId: string,
): Promise<CommunityActionState> {
  try {
    const beat = await publishApprovedUserBeat(beatId);
    revalidateCommunitySurfaces(beat.id);
    return { error: null, success: true, beatId: beat.id };
  } catch (error) {
    return catchAction(error);
  }
}

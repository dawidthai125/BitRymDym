"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  PROVISIONAL_DRAFT_BPM,
  PROVISIONAL_DRAFT_DURATION_SECONDS,
} from "@/lib/beats/audio-transport";
import { beatActionErrorMessage } from "@/lib/beats/beat-operation-error";
import { requireUser } from "@/lib/auth/session";
import type { Beat } from "@/types/domain";
import {
  approveUserBeat,
  archiveOwnUserBeat,
  createUserBeat,
  publishApprovedUserBeat,
  overrideBeatAutoCheckForModeration,
  rejectUserBeat,
  retryBeatAutoCheckForModeration,
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

/** Moderation result e-mail to the owner — after the response, never blocks or fails the action. */
function notifyModeration(beat: Beat, kind: "beat_approved" | "beat_rejected", reason?: string) {
  if (!beat.ownerId) return;
  const ownerId = beat.ownerId;
  after(async () => {
    const { sendNotification } = await import("@/lib/email/notify/server");
    await sendNotification({ userId: ownerId, kind, data: { beatId: beat.id, beatTitle: beat.title, reason: reason ?? null } });
  });
}

export async function approveUserBeatAction(
  beatId: string,
): Promise<CommunityActionState> {
  try {
    const beat = await approveUserBeat(beatId);
    revalidateCommunitySurfaces(beat.id);
    notifyModeration(beat, "beat_approved");
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
    notifyModeration(beat, "beat_rejected", rejectionReason);
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

export async function overrideAutoCheckAction(
  beatId: string,
  reason: string,
): Promise<CommunityActionState> {
  try {
    await overrideBeatAutoCheckForModeration(beatId, reason);
    revalidateCommunitySurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

export async function retryAutoCheckAction(beatId: string): Promise<CommunityActionState> {
  try {
    await retryBeatAutoCheckForModeration(beatId);
    revalidateCommunitySurfaces(beatId);
    return { error: null, success: true, beatId };
  } catch (error) {
    return catchAction(error);
  }
}

/** Owner appeal of an auto-reject (RLS-checked RPC as the signed-in owner). */
export async function requestAutoCheckAppealAction(
  checkId: string,
  note: string,
): Promise<CommunityActionState> {
  try {
    await requireUser();
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("request_beat_auto_check_appeal", {
      p_check_id: checkId,
      p_note: note.trim().slice(0, 1000),
    });
    if (error) {
      return { error: "Nie udało się wysłać odwołania.", success: false };
    }
    return { error: null, success: true };
  } catch (error) {
    return catchAction(error);
  }
}

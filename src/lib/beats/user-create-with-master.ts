"use server";

import { revalidatePath } from "next/cache";

import { finalizeUserBeatAfterUpload } from "@/lib/beats/audio-transport";
import { beatActionErrorMessage } from "@/lib/beats/beat-operation-error";

export type FinalizeUserBeatState = {
  error: string | null;
  success: boolean;
  beatId?: string;
};

/**
 * Finalize USER DRAFT after signed binary upload + analyze.
 * JSON only — stays DRAFT (Wave 2 — no submit).
 */
export async function finalizeUserBeatWithMasterAction(params: {
  beatId: string;
  assetId: string;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  bpmManualOverride?: boolean;
  bpmSelectionMode?: "AUTO" | "CANDIDATE" | "RANGE";
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<FinalizeUserBeatState> {
  try {
    const result = await finalizeUserBeatAfterUpload(params);
    revalidatePath("/account");
    revalidatePath(`/account/beats`);
    // Public catalog must not gain DRAFT rows
    revalidatePath("/beats");
    return { error: null, success: true, beatId: result.beatId };
  } catch (error) {
    return {
      error: beatActionErrorMessage(error, "beats/user-create-with-master"),
      success: false,
    };
  }
}

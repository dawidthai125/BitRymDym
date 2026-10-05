"use server";

import { AuthError } from "@/lib/auth/session";
import {
  loadSamplePolicySettings,
  updateSamplePolicySettings,
  type SamplePolicySettingsRow,
} from "@/lib/takes/sample-policy-settings";
import { toUserFacingError } from "@/lib/ui/user-errors";

export type SamplePolicyActionState = {
  error: string | null;
  success: boolean;
  settings?: SamplePolicySettingsRow;
};

export async function loadSamplePolicySettingsAction(): Promise<SamplePolicySettingsRow> {
  return loadSamplePolicySettings();
}

export async function updateSamplePolicySettingsAction(params: {
  bronzeMaxRecordingSeconds: number;
  silverMaxRecordingSeconds: number;
  goldMaxRecordingSeconds: number;
}): Promise<SamplePolicyActionState> {
  try {
    const settings = await updateSamplePolicySettings({
      bronzeMaxRecordingSeconds: params.bronzeMaxRecordingSeconds,
      silverMaxRecordingSeconds: params.silverMaxRecordingSeconds,
      goldMaxRecordingSeconds: params.goldMaxRecordingSeconds,
    });
    return { error: null, success: true, settings };
  } catch (error) {
    const raw =
      error instanceof AuthError || error instanceof Error
        ? error.message
        : "Nie udało się zapisać ustawień.";
    return {
      error: toUserFacingError(raw, "generic"),
      success: false,
    };
  }
}

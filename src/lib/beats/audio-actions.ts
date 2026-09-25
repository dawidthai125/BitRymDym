"use server";

import { AuthError } from "@/lib/auth/session";
import { requestBeatAudioAccess } from "@/lib/beats/audio-access";
import {
  archivePlatformBeatAudio,
  getBeatAudioPublicInfo,
  uploadPlatformBeatAudio,
} from "@/lib/beats/audio-service";
import {
  isAudioAccessPurpose,
  type AudioAccessPurpose,
} from "@/lib/beats/audio-validation";
import type { BeatAudioPurpose } from "@/types/domain";

export type AudioActionState = {
  error: string | null;
  success: boolean;
  assetId?: string;
  url?: string;
  expiresAt?: string;
};

function catchAudio(error: unknown): AudioActionState {
  if (error instanceof AuthError) {
    return { error: error.message, success: false };
  }
  return {
    error: error instanceof Error ? error.message : "Audio action failed.",
    success: false,
  };
}

export async function requestBeatAudioAccessAction(params: {
  beatId: string;
  purpose: string;
}): Promise<AudioActionState> {
  try {
    if (!isAudioAccessPurpose(params.purpose)) {
      return { error: "Invalid purpose.", success: false };
    }
    const result = await requestBeatAudioAccess({
      beatId: params.beatId,
      purpose: params.purpose as AudioAccessPurpose,
    });
    return {
      error: null,
      success: true,
      url: result.url,
      expiresAt: result.expiresAt,
      assetId: result.assetId,
    };
  } catch (error) {
    return catchAudio(error);
  }
}

export async function uploadPlatformBeatAudioAction(params: {
  beatId: string;
  purpose?: BeatAudioPurpose;
  base64: string;
  contentType: string;
  originalFilename?: string | null;
}): Promise<AudioActionState> {
  try {
    const bytes = Uint8Array.from(Buffer.from(params.base64, "base64"));
    const asset = await uploadPlatformBeatAudio({
      beatId: params.beatId,
      purpose: params.purpose,
      bytes,
      contentType: params.contentType,
      originalFilename: params.originalFilename,
    });
    return { error: null, success: true, assetId: asset.id };
  } catch (error) {
    return catchAudio(error);
  }
}

export async function archivePlatformBeatAudioAction(
  assetId: string,
): Promise<AudioActionState> {
  try {
    const asset = await archivePlatformBeatAudio(assetId);
    return { error: null, success: true, assetId: asset.id };
  } catch (error) {
    return catchAudio(error);
  }
}

export async function getBeatAudioPublicInfoAction(beatId: string) {
  return getBeatAudioPublicInfo(beatId);
}

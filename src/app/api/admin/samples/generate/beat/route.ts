import { NextResponse } from "next/server";

import { isUuid } from "@/lib/beats/audio-validation";
import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";
import { beatTempoAndKey } from "@/lib/studio/samples/sample-generator-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET ?beatId= → { bpm, key } of a catalog beat; the key is measured from its master, not stored. */
export async function GET(request: Request) {
  const beatId = new URL(request.url).searchParams.get("beatId");
  if (!isUuid(beatId)) return beatApiBadRequest("Nieznany bit.");
  try {
    return NextResponse.json({ success: true, ...(await beatTempoAndKey(beatId)) });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/samples/generate/beat");
  }
}

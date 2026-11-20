import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { isUuid } from "@/lib/beats/audio-validation";
import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";
import { publishGeneratedSample } from "@/lib/studio/samples/sample-generator-server";

export const runtime = "nodejs";

/** POST JSON { sampleId } → the admin's generated sample enters the public catalog. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sampleId?: unknown } | null;
  if (!isUuid(body?.sampleId)) return beatApiBadRequest("Nieznany sampel.");
  try {
    await publishGeneratedSample(body.sampleId);
    revalidatePath("/sampel");
    return NextResponse.json({ success: true });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/samples/generate/publish");
  }
}

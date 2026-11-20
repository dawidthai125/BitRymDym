import { NextResponse } from "next/server";

import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";
import { parseSampleGenBody } from "@/lib/studio/samples/sample-generator";
import { startSampleGeneration } from "@/lib/studio/samples/sample-generator-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST JSON { preset, type, bpm?, bars?, key?, style?, count } → several Stable Audio jobs at once. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseSampleGenBody(body);
  if (!parsed.ok) return beatApiBadRequest(parsed.error);
  const count = Math.max(1, Math.min(4, Math.round(Number(body?.count ?? 2)) || 2));
  try {
    const jobs = await Promise.all(Array.from({ length: count }, () => startSampleGeneration(parsed.req)));
    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/samples/generate");
  }
}

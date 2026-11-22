import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { isStableAudioGenerationId } from "@/lib/beats/ai-beat/stability";
import { isUuid } from "@/lib/beats/audio-validation";
import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";
import { parseSampleGenBody } from "@/lib/studio/samples/sample-generator";
import { finishSampleGeneration, type GeneratedSample } from "@/lib/studio/samples/sample-generator-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const saved = new Map<string, GeneratedSample>();
const saving = new Set<string>();

/** POST JSON { generationId, title, beatId?, ...request } → pending | ready with the saved private sample. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isStableAudioGenerationId(body?.generationId)) return beatApiBadRequest("Nieznane generowanie.");
  const parsed = parseSampleGenBody(body);
  if (!parsed.ok) return beatApiBadRequest(parsed.error);
  const generationId = body.generationId;
  // 2026-11-22: check the admin before answering from the in-memory cache.
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/samples/generate/result");
  }
  const done = saved.get(generationId);
  if (done) return NextResponse.json({ success: true, status: "ready", ...done });
  if (saving.has(generationId)) return NextResponse.json({ success: true, status: "pending" });
  saving.add(generationId);
  try {
    const result = await finishSampleGeneration({
      generationId,
      req: parsed.req,
      title: typeof body?.title === "string" ? body.title : "Sampel BitRymDym",
      beatId: isUuid(body?.beatId) ? body.beatId : null,
    });
    if (result.status === "ready") saved.set(generationId, { sample: result.sample, measured: result.measured });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/samples/generate/result");
  } finally {
    saving.delete(generationId);
  }
}

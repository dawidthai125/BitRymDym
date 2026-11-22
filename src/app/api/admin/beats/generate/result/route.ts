import { NextResponse } from "next/server";

import { pollBeatGeneration, requireAdminGenerator } from "@/lib/beats/ai-beat/generate";
import { ingestGeneratedBeat } from "@/lib/beats/ai-beat/ingest";
import {
  normalizeBeatDescription,
  normalizeBeatHintBpm,
  sanitizeBeatOpis,
  sanitizeBeatStyle,
  sanitizeBeatTitle,
} from "@/lib/beats/ai-beat/prompt";
import { isStableAudioGenerationId } from "@/lib/beats/ai-beat/stability";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import { BeatRequestError } from "@/lib/beats/request-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const saved = new Map<string, { beatId: string; bpm: number }>();
const saving = new Set<string>();

/**
 * POST JSON { generationId, title, description, bpm?, style?, opis? }
 * Pending until the model finishes, then saves one platform draft.
 * style and opis are echoed by the browser and sanitized here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    generationId?: unknown;
    title?: unknown;
    description?: unknown;
    bpm?: unknown;
    style?: unknown;
    opis?: unknown;
  } | null;

  if (!isStableAudioGenerationId(body?.generationId)) {
    return beatApiBadRequest("Nieznane generowanie.");
  }
  const description = normalizeBeatDescription(body?.description);
  const bpm = normalizeBeatHintBpm(body?.bpm);
  if (!description || bpm === "invalid") {
    return beatApiBadRequest("Opis bitu jest niekompletny.");
  }

  const generationId = body.generationId;
  // 2026-11-22: check the admin before answering from the in-memory cache.
  try {
    await requireAdminGenerator();
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/result");
  }
  const already = saved.get(generationId);
  if (already) {
    return NextResponse.json({ success: true, status: "ready", ...already });
  }
  if (saving.has(generationId)) {
    return NextResponse.json({ success: true, status: "pending" });
  }

  let ownsSave = false;
  try {
    const polled = await pollBeatGeneration(generationId);
    if (polled.status === "pending") {
      return NextResponse.json({ success: true, status: "pending" });
    }
    if (polled.status === "error") {
      throw new BeatRequestError(polled.message);
    }
    const raced = saved.get(generationId);
    if (raced) {
      return NextResponse.json({ success: true, status: "ready", ...raced });
    }
    if (saving.has(generationId)) {
      return NextResponse.json({ success: true, status: "pending" });
    }

    ownsSave = true;
    saving.add(generationId);
    const stored = await ingestGeneratedBeat({
      bytes: polled.bytes,
      contentType: polled.contentType,
      title: sanitizeBeatTitle(body?.title),
      description,
      style: sanitizeBeatStyle(body?.style),
      styleDescription: sanitizeBeatOpis(body?.opis),
      bpmHint: bpm,
    });
    saved.set(generationId, stored);
    return NextResponse.json({ success: true, status: "ready", ...stored });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/result");
  } finally {
    if (ownsSave) saving.delete(generationId);
  }
}

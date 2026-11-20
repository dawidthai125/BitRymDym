import { NextResponse } from "next/server";

import { startBeatGeneration } from "@/lib/beats/ai-beat/generate";
import { normalizeStableAudioSampling } from "@/lib/beats/ai-beat/stability";
import {
  normalizeBeatDescription,
  normalizeBeatDuration,
  normalizeBeatHintBpm,
} from "@/lib/beats/ai-beat/prompt";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * POST JSON { description, durationSeconds, bpm?, seed?, cfgScale? }
 * Starts one Stable Audio instrumental. The file arrives on the result route.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    description?: unknown;
    durationSeconds?: unknown;
    bpm?: unknown;
    seed?: unknown;
    cfgScale?: unknown;
  } | null;

  const description = normalizeBeatDescription(body?.description);
  const duration = normalizeBeatDuration(body?.durationSeconds);
  const bpm = normalizeBeatHintBpm(body?.bpm);
  if (!description || !duration || bpm === "invalid") {
    return beatApiBadRequest(
      "Wpisz opis bitu (min. 8 znaków), wybierz długość i ewentualnie tempo 60–180.",
    );
  }

  try {
    const sampling = normalizeStableAudioSampling(body?.seed, body?.cfgScale);
    const started = await startBeatGeneration({ description, duration, bpm, sampling });
    return NextResponse.json({
      success: true,
      generationId: started.generationId,
      title: started.title,
      style: started.style,
      opis: started.opis,
      seed: started.seed,
      cfgScale: started.cfgScale,
    });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate");
  }
}

import { NextResponse } from "next/server";

import { releaseWaitingBeat } from "@/lib/beats/ai-beat/release";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatAudioApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import type { CatalogLane } from "@/lib/beats/catalog-lane";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST JSON { beatId, lane: "free" | "paid" } → { success: true }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    lane?: unknown;
  } | null;
  if (!isUuid(body?.beatId)) {
    return beatApiBadRequest("Nieznany bit.");
  }
  if (body.lane !== "free" && body.lane !== "paid") {
    return beatApiBadRequest("Wybierz katalog: darmowy albo płatny.");
  }
  const lane: CatalogLane = body.lane;

  try {
    await releaseWaitingBeat(body.beatId, lane);
    return NextResponse.json({ success: true });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/waiting/release");
  }
}

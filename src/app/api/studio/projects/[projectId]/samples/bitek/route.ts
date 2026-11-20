import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import {
  applyBitekSamplePlacement,
  previewBitekSamplePlacement,
} from "@/lib/studio/samples/sample-bitek-place";
import type { PlacementScope } from "@/lib/studio/samples/sample-bitek-plan";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

const SCOPES: PlacementScope[] = ["once", "section", "song"];

/**
 * POST — Bitek places a sample in the song.
 * { sampleId, trackId, playheadMs, scope, apply?: boolean, expectedDocumentVersion? }
 * apply=false (default) → { plan } only. apply=true → { clips, documentVersion, plan } (CAS).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      sampleId?: unknown;
      trackId?: unknown;
      playheadMs?: unknown;
      scope?: unknown;
      apply?: unknown;
      expectedDocumentVersion?: unknown;
    };
    if (typeof body.sampleId !== "string" || typeof body.trackId !== "string") {
      return NextResponse.json({ error: "sampleId i trackId są wymagane." }, { status: 400 });
    }
    const scope = SCOPES.includes(body.scope as PlacementScope) ? (body.scope as PlacementScope) : "once";
    const playheadMs = typeof body.playheadMs === "number" && Number.isFinite(body.playheadMs) ? body.playheadMs : 0;
    const auth = await requireUser();
    const req = { projectId, sampleId: body.sampleId, trackId: body.trackId, playheadMs, scope };
    if (body.apply !== true) {
      const { plan, sampleTitle } = await previewBitekSamplePlacement(auth, req);
      return NextResponse.json({ plan, sampleTitle });
    }
    if (typeof body.expectedDocumentVersion !== "number") {
      return NextResponse.json({ error: "expectedDocumentVersion jest wymagane." }, { status: 400 });
    }
    const result = await applyBitekSamplePlacement(auth, { ...req, expectedDocumentVersion: body.expectedDocumentVersion });
    return NextResponse.json(result);
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

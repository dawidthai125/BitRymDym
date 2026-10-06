import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { updateStudioTrackEffectsChain } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; trackId: string }>;
};

/** PATCH — persist track effects_chain with document_version CAS. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId, trackId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      chain?: unknown;
    };
    const result = await updateStudioTrackEffectsChain({
      projectId,
      trackId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      chain: body.chain,
    });
    return NextResponse.json({
      success: true,
      documentVersion: result.documentVersion,
      effectsChain: result.effectsChain,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

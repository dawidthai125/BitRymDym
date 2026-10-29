import { NextResponse } from "next/server";

import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";
import { updateStudioTrackEffectsChain } from "@/lib/studio/studio-service";
import { assertTuneChainsAllowedForUser } from "@/lib/studio/tune/tune-gate-server";

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
    // Plan gate: BRD Tune hard/custom style is Silver+ (403 PLAN_FEATURE_LOCKED).
    await assertTuneChainsAllowedForUser([body.chain]);
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
    return fxPresetErrorResponse(error);
  }
}

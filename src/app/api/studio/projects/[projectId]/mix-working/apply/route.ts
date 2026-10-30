import { NextResponse } from "next/server";

import { applyStudioMixWorkingOps } from "@/lib/studio/mix-working-apply-service";
import { parseClientMixRevisionMeta } from "@/lib/studio/mix-working/mix-working-client-revision";
import { StudioPlanFeatureError } from "@/lib/studio/presets/fx-presets-server";
import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { assertTuneChainsAllowedForUser, tuneChainsInMixOps } from "@/lib/studio/tune/tune-gate-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/**
 * POST — atomic Mix Working Plane apply (A1).
 * Body must not supply ownerId as an auth source.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      requestId?: unknown;
      ops?: unknown;
      ownerId?: unknown;
      revision?: unknown;
    };

    // Explicitly ignore any client-supplied ownerId.
    void body.ownerId;

    // Plan gate: BRD Tune hard/custom style is Silver+ (403 PLAN_FEATURE_LOCKED).
    await assertTuneChainsAllowedForUser(tuneChainsInMixOps(body.ops));
    const result = await applyStudioMixWorkingOps({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      requestId: body.requestId,
      ops: body.ops,
      // Stage 2: only { author: "AI", description } (BITEK auto-fix) is honoured.
      revision: parseClientMixRevisionMeta(body.revision),
    });

    return NextResponse.json({
      success: true,
      documentVersion: result.documentVersion,
      documentDigest: result.documentDigest,
      replay: result.replay,
      revisionId: result.revisionId,
    });
  } catch (error) {
    if (error instanceof StudioPlanFeatureError) return fxPresetErrorResponse(error);
    return studioApiErrorResponse(error);
  }
}

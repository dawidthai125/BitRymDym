import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { updateStudioMasterFxChain } from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** PATCH — persist master_fx_chain with document_version CAS. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      chain?: unknown;
    };
    const result = await updateStudioMasterFxChain({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      chain: body.chain,
    });
    return NextResponse.json({
      success: true,
      documentVersion: result.documentVersion,
      masterFxChain: result.masterFxChain,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

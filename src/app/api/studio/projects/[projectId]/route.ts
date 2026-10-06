import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  getStudioProjectDocument,
  updateStudioMasterMix,
} from "@/lib/studio/studio-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — load owned Studio project document. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }
    const document = await getStudioProjectDocument(projectId);
    return NextResponse.json({ success: true, document });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/**
 * PATCH — P6.4.1 Master Gain/Pan on existing project columns with document_version CAS.
 * Does not mutate FX chains. No new table.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 },
      );
    }
    const body = (await request.json()) as {
      expectedDocumentVersion?: unknown;
      masterGainDb?: unknown;
      masterPan?: unknown;
    };
    const result = await updateStudioMasterMix({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      masterGainDb: body.masterGainDb,
      masterPan: body.masterPan,
    });
    return NextResponse.json({
      success: true,
      documentVersion: result.documentVersion,
      masterGainDb: result.masterGainDb,
      masterPan: result.masterPan,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { getMixWorkingRevision } from "@/lib/studio/mix-working-revision-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; revisionId: string }>;
};

/** GET — single Mix Working revision with snapshot. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId, revisionId } = await context.params;
    const revision = await getMixWorkingRevision({ projectId, revisionId });
    return NextResponse.json({ success: true, revision });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

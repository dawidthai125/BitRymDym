import { NextResponse } from "next/server";

import { listMixWorkingRevisions } from "@/lib/studio/mix-working-revision-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/** GET — paginated Mix Working revision history for a project. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const result = await listMixWorkingRevisions({
      projectId,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    return NextResponse.json({
      success: true,
      revisions: result.revisions,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

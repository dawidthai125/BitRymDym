import { NextResponse } from "next/server";

import { compareMixWorkingRevisions } from "@/lib/studio/mix-working-revision-service";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

/** POST — deterministic diff of two revisions in the same project. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      fromRevisionId?: unknown;
      toRevisionId?: unknown;
      ownerId?: unknown;
    };
    void body.ownerId;
    const diff = await compareMixWorkingRevisions({
      projectId,
      fromRevisionId: body.fromRevisionId,
      toRevisionId: body.toRevisionId,
    });
    return NextResponse.json({ success: true, diff });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

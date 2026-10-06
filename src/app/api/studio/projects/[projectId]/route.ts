import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { getStudioProjectDocument } from "@/lib/studio/studio-service";

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

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getStudioJob } from "@/lib/studio/master/server";

import { masterErrorResponse } from "../../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string; jobId: string }> };

/** GET — master/deliver job status; short-lived signed download URL once done. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId, jobId } = await context.params;
    const auth = await requireUser();
    const r = await getStudioJob({ ownerId: auth.userId, projectId, jobId, filename: "bitrymdym" });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

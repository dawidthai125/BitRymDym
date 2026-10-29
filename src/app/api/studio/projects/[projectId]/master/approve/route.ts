import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { approveStudioMaster } from "@/lib/studio/master/server";

import { masterErrorResponse, readJson } from "../_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/** POST {jobId} — „Zatwierdzam, utwór jest gotowy”. Only a succeeded master can be approved. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    const r = await approveStudioMaster({ ownerId: auth.userId, projectId, jobId: String(body?.jobId ?? "") });
    return NextResponse.json({ success: r.ok }, { status: r.ok ? 200 : 409 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

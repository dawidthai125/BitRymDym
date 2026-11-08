import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { assertSeparatorEnqueueAllowed } from "@/lib/studio/plan-feature-gate-server";
import { enqueueSeparateJob, latestSeparateJob } from "@/lib/studio/separate/separate-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** POST { projectId } — queue a 4-stem job. Does not run Demucs. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!PROJECT_ID.test(projectId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await assertSeparatorEnqueueAllowed();
    const result = await enqueueSeparateJob(auth.userId, projectId);
    if (!result.ok && result.error === "no_audio") return NextResponse.json({ error: "no_audio" }, { status: 404 });
    if (!result.ok && result.error === "in_progress") return NextResponse.json({ error: "in_progress" }, { status: 409 });
    if (!result.ok && result.error === "unavailable") return NextResponse.json({ error: "separator_unavailable" }, { status: 503 });
    if (!result.ok) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    return NextResponse.json({ accepted: true, jobId: result.jobId, status: result.status }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthError) return studioApiErrorResponse(error);
    return studioApiErrorResponse(error);
  }
}

/** Latest job for this owner. Stem links exist only after the host worker succeeds. */
export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!PROJECT_ID.test(projectId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const job = await latestSeparateJob(auth.userId, projectId);
    if (job === "unavailable") return NextResponse.json({ error: "separator_unavailable" }, { status: 503 });
    return NextResponse.json({ job });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

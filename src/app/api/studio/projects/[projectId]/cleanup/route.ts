import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { applyCleanupJob, CleanupUnavailable, enqueueCleanupJob, listCleanupJobs } from "@/lib/studio/cleanup/cleanup-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

import { readJson, tierOf } from "../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

const DENY: Record<string, number> = { not_found: 404, take_unavailable: 409, in_progress: 409, daily_limit: 429 };

function errorResponse(error: unknown) {
  if (error instanceof CleanupUnavailable) return NextResponse.json({ success: true, available: false });
  return studioApiErrorResponse(error);
}

/** GET — this project's vocal cleanup jobs + today's quota. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    return NextResponse.json({ success: true, tier, ...(await listCleanupJobs({ ownerId: auth.userId, projectId, tier })) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST { takeId, settings: { noise, reverb } } — queue a cleanup on the E3 worker. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const tier = await tierOf(auth);
    const r = await enqueueCleanupJob({ ownerId: auth.userId, projectId, takeId: String(body.takeId ?? ""), settings: body.settings, tier });
    return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 202 : DENY[r.error] ?? 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH { takeId, jobId | null } — use the cleaned version (or go back to the original). */
export async function PATCH(request: Request) {
  try {
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const jobId = body.jobId == null ? null : String(body.jobId);
    const r = await applyCleanupJob({ ownerId: auth.userId, takeId: String(body.takeId ?? ""), jobId });
    return NextResponse.json({ success: r.ok }, { status: r.ok ? 200 : 409 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  createRenderJob,
  listRenderJobs,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";
import { MixAuthzError, sanitizeMixClientClaims } from "@/lib/mix/authz-core";
import { MixParamsError } from "@/lib/mix/params";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (
    error instanceof RenderJobDomainError ||
    error instanceof MixAuthzError ||
    error instanceof AuthError ||
    error instanceof AudioEntitlementError ||
    error instanceof MixParamsError
  ) {
    const status =
      error instanceof MixParamsError
        ? 400
        : error instanceof AudioEntitlementError
          ? error.code === "UNAUTHENTICATED"
            ? 401
            : 403
          : toRenderJobHttpStatus(error);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Render job failed." },
    { status: 400 },
  );
}

/** POST /api/mix/session/[id]/jobs — create render job */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: mixSessionId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    sanitizeMixClientClaims(body);
    const job = await createRenderJob({
      mixSessionId,
      requestedTier: body.requestedTier,
      idempotencyKey: body.idempotencyKey,
      body,
    });
    return NextResponse.json({ success: true, job });
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/mix/session/[id]/jobs — list own jobs for session */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: mixSessionId } = await context.params;
    const jobs = await listRenderJobs(mixSessionId);
    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    return errorResponse(error);
  }
}

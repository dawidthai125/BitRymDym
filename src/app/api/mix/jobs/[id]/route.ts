import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import {
  getRenderJob,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";
import { MixAuthzError } from "@/lib/mix/authz-core";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (
    error instanceof RenderJobDomainError ||
    error instanceof MixAuthzError ||
    error instanceof AuthError ||
    error instanceof AudioEntitlementError
  ) {
    const status =
      error instanceof AudioEntitlementError
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

/** GET /api/mix/jobs/[id] */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await getRenderJob(id);
    return NextResponse.json({ success: true, job });
  } catch (error) {
    return errorResponse(error);
  }
}

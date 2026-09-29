import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  cancelRenderJob,
  toRenderJobHttpStatus,
} from "@/lib/audio/render-job-service";
import { MixAuthzError } from "@/lib/mix/authz-core";

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
    { error: error instanceof Error ? error.message : "Cancel failed." },
    { status: 400 },
  );
}

/** POST /api/mix/jobs/[id]/cancel */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await cancelRenderJob(id);
    return NextResponse.json({ success: true, job });
  } catch (error) {
    return errorResponse(error);
  }
}

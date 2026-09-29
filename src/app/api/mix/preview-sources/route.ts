import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { MixAuthzError, toHttpStatus } from "@/lib/mix/authz-core";
import { MixParamsError } from "@/lib/mix/params";
import { createMixPreviewSources } from "@/lib/mix/session-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (
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
          : toHttpStatus(error as MixAuthzError | AuthError);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "Mix preview sources failed.",
    },
    { status: 400 },
  );
}

/**
 * POST { sessionId } — signed take + beat URLs for client Mix preview.
 * Does not write audio-artifacts.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = body.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 },
      );
    }
    const sources = await createMixPreviewSources(sessionId);
    return NextResponse.json({ success: true, ...sources });
  } catch (error) {
    return errorResponse(error);
  }
}

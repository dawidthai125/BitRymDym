import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { MixAuthzError, toHttpStatus } from "@/lib/mix/authz-core";
import { MixParamsError } from "@/lib/mix/params";
import {
  getMixSession,
  updateMixSessionParameters,
} from "@/lib/mix/session-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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
    { error: error instanceof Error ? error.message : "Mix session failed." },
    { status: 400 },
  );
}

/** GET /api/mix/session/[id] */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getMixSession(id);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/mix/session/[id] { parameters } */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, "parameters")) {
      return NextResponse.json(
        { error: "parameters is required." },
        { status: 400 },
      );
    }
    const session = await updateMixSessionParameters({
      sessionId: id,
      parameters: body.parameters,
      body,
    });
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return errorResponse(error);
  }
}

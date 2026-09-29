import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { AudioEntitlementError } from "@/lib/audio/effective-entitlement";
import { MixAuthzError, toHttpStatus } from "@/lib/mix/authz-core";
import { MixParamsError } from "@/lib/mix/params";
import {
  createMixSession,
  listOwnMixSessionsForBeat,
} from "@/lib/mix/session-service";

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
    { error: error instanceof Error ? error.message : "Mix session failed." },
    { status: 400 },
  );
}

/** POST { takeId, beatId, parameters? } — create Mix Session */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const takeId = body.takeId;
    const beatId = body.beatId;
    if (typeof takeId !== "string" || !takeId) {
      return NextResponse.json({ error: "takeId is required." }, { status: 400 });
    }
    if (typeof beatId !== "string" || !beatId) {
      return NextResponse.json({ error: "beatId is required." }, { status: 400 });
    }

    const session = await createMixSession({
      takeId,
      beatId,
      parameters: body.parameters,
      body,
    });
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET ?beatId= — list own sessions for beat */
export async function GET(request: Request) {
  try {
    const beatId = new URL(request.url).searchParams.get("beatId");
    if (!beatId) {
      return NextResponse.json({ error: "beatId is required." }, { status: 400 });
    }
    const context = await requireUser();
    const sessions = await listOwnMixSessionsForBeat(context, beatId);
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

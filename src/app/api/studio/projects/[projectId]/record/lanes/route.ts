import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isStudioRecordingFeatureEnabled } from "@/config/studio-recording-features";
import {
  deleteTakeLaneFor,
  listTakeLanesFor,
  saveTakeLaneFor,
} from "@/lib/studio/recording/recording-store-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

function gated() {
  return !isStudioRecordingFeatureEnabled("multiTakeComping")
    ? NextResponse.json({ error: "feature_disabled" }, { status: 403 })
    : null;
}

/** GET — take lanes of the project (`available:false` before the migration). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    return NextResponse.json({ success: true, ...(await listTakeLanesFor(auth, projectId)) });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** PUT {lane} — upsert one lane (stars, comp choice, passes). Takes verified server-side. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const deny = gated();
    if (deny) return deny;
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { lane?: unknown } | null;
    if (!body?.lane) return NextResponse.json({ error: "lane jest wymagane." }, { status: 400 });
    return NextResponse.json({ success: true, ...(await saveTakeLaneFor(auth, projectId, body.lane)) });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** DELETE ?laneId= — forget a lane (timeline clips stay). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const laneId = new URL(request.url).searchParams.get("laneId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(laneId)) {
      return NextResponse.json({ error: "laneId jest wymagane." }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await deleteTakeLaneFor(auth, projectId, laneId)) });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

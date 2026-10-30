import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { deleteStudioReferenceForOwner, finalizeStudioReference, getStudioReferenceState, prepareStudioReference } from "@/lib/studio/master/reference-server";

import { DENY_STATUS, masterErrorResponse, readJson, tierOf } from "../_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — reference mastering access (plan / add-on) + this project's current reference. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    return NextResponse.json({ success: true, tier, ...(await getStudioReferenceState({ ownerId: auth.userId, projectId, tier })) });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

/**
 * POST {action:"prepare", fileName, mime, byteSize, durationMs} → referenceId + signed upload per part;
 * POST {action:"finalize", referenceId} → ready (all parts uploaded).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const tier = await tierOf(auth);
    if (body.action === "prepare") {
      const r = await prepareStudioReference({ ownerId: auth.userId, projectId, tier, body });
      return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 200 : DENY_STATUS[r.error] ?? 400 });
    }
    if (body.action === "finalize") {
      const r = await finalizeStudioReference({ ownerId: auth.userId, projectId, tier, referenceId: body.referenceId });
      return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 200 : DENY_STATUS[r.error] ?? 400 });
    }
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

/** DELETE ?id=… — remove the uploaded reference now (file + row). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    const r = await deleteStudioReferenceForOwner({ ownerId: auth.userId, projectId, referenceId: id });
    return NextResponse.json({ success: r.ok }, { status: r.ok ? 200 : 404 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

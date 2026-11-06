import { NextResponse } from "next/server";

import { maxStemsForTier } from "@/config/plan-policy";
import { isStudioTrackRole } from "@/config/studio";
import { requireUser } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { addStudioTrack, updateStudioTrackControls } from "@/lib/studio/studio-service";

import { tierOf } from "../../master/_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST { expectedDocumentVersion, name?, trackRole? } — Silver/Gold: add a SAMPLE track for an imported
 * stem and name it after the file (two CAS steps, one response). Plan capacity is enforced by addStudioTrack.
 * → { track, documentVersion }.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    if (maxStemsForTier(await tierOf(auth)) < 1) {
      return NextResponse.json({ error: "Import stemów jest od planu Silver.", code: "STEM_TIER" }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as {
      expectedDocumentVersion?: unknown;
      name?: unknown;
      trackRole?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    const added = await addStudioTrack({
      projectId,
      expectedDocumentVersion: body.expectedDocumentVersion,
      trackType: "SAMPLE",
    });
    const role = isStudioTrackRole(body.trackRole) ? body.trackRole : undefined;
    if (!name && !role) {
      return NextResponse.json({ success: true, track: added.track, documentVersion: added.documentVersion });
    }
    const named = await updateStudioTrackControls({
      projectId,
      trackId: added.track.id,
      expectedDocumentVersion: added.documentVersion,
      name: name || undefined,
      trackRole: role,
    });
    return NextResponse.json({ success: true, track: named.track, documentVersion: named.documentVersion });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

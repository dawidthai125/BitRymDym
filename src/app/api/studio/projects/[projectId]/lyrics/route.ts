import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { LyricsValidationError, parseLyricsDocForWrite } from "@/lib/studio/lyrics/lyrics";
import { getProjectLyrics, saveProjectLyrics } from "@/lib/studio/lyrics/lyrics-store-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — lyrics of an owned project (all logged-in plans). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const result = await getProjectLyrics({ ownerId: auth.userId, projectId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** PUT { expectedVersion, doc } — save with CAS (409 on a stale version). */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    let body: { expectedVersion?: unknown; doc?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "bad_body" }, { status: 400 });
    }
    let doc;
    try {
      doc = parseLyricsDocForWrite(body?.doc);
    } catch (e) {
      if (e instanceof LyricsValidationError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
      throw e;
    }
    const lyrics = await saveProjectLyrics({
      ownerId: auth.userId,
      projectId,
      doc,
      expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : -1,
    });
    return NextResponse.json({ success: true, available: true, lyrics });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

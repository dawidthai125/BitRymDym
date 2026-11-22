import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requestUserAccessBearer } from "@/lib/supabase/server";
import { placeReadyTakeAsStudioClip } from "@/lib/studio/studio-record-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST — place a READY Take as a Studio Clip at the captured playhead.
 * Auth + project ownership enforced in service. Client must not send storage keys.
 * CAS: expectedDocumentVersion required (idempotent reuse returns current version).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      trackId?: string;
      takeId?: string;
      timelineStartMs?: number;
      expectedDocumentVersion?: unknown;
      replaceOverlapping?: boolean;
      sourceOffsetMs?: number;
      durationMs?: number;
      ownerId?: string | null;
      objectKey?: string | null;
      sendId?: unknown;
    };

    // Reject client-chosen storage / ownership identity (P4 contract).
    if (body.ownerId != null || body.objectKey != null) {
      return NextResponse.json(
        { error: "Niedozwolone parametry storage / ownership." },
        { status: 400 },
      );
    }

    if (!body.trackId || !body.takeId) {
      return NextResponse.json(
        { error: "trackId i takeId są wymagane." },
        { status: 400 },
      );
    }
    if (typeof body.timelineStartMs !== "number") {
      return NextResponse.json(
        { error: "timelineStartMs jest wymagane (integer ms)." },
        { status: 400 },
      );
    }

    const optionalInt = (v: unknown) =>
      v == null ? undefined : typeof v === "number" ? v : Number.NaN;
    const sourceOffsetMs = optionalInt(body.sourceOffsetMs);
    const durationMs = optionalInt(body.durationMs);
    if (Number.isNaN(sourceOffsetMs) || Number.isNaN(durationMs)) {
      return NextResponse.json(
        { error: "sourceOffsetMs / durationMs muszą być liczbą (integer ms)." },
        { status: 400 },
      );
    }

    // 2026-11-22: the Windows recorder (bearer auth; the site uses cookies) must have a
    // daily send (POST /api/desktop/studio-send). The first place binds it to the project,
    // so it can no longer be refunded. Before the place, so nothing lands without a send.
    // sendId (newer recorder builds): bind exactly that send; without it the newest free one.
    if (body.sendId != null && (typeof body.sendId !== "string" || !UUID.test(body.sendId))) {
      return NextResponse.json({ error: "Nieprawidłowy identyfikator wysyłki." }, { status: 400 });
    }
    if (await requestUserAccessBearer()) {
      const denied = await desktopSendDenied(projectId, (body.sendId as string | undefined) ?? null);
      if (denied) return denied;
    }

    const result = await placeReadyTakeAsStudioClip({
      projectId,
      trackId: body.trackId,
      takeId: body.takeId,
      timelineStartMs: body.timelineStartMs,
      expectedDocumentVersion: body.expectedDocumentVersion,
      replaceOverlapping: body.replaceOverlapping === true,
      sourceOffsetMs,
      durationMs,
    });

    return NextResponse.json(
      {
        success: true,
        clip: result.clip,
        takeId: result.takeId,
        durationMs: result.durationMs,
        reusedExisting: result.reusedExisting,
        documentVersion: result.documentVersion,
      },
      { status: result.reusedExisting ? 200 : 201 },
    );
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function desktopSendDenied(projectId: string, sendId: string | null): Promise<NextResponse | null> {
  const profile = await getCurrentProfile();
  // No session / bad id: the service below answers with its own auth / not-found error.
  if (!profile || !UUID.test(projectId)) return null;
  const admin = createSupabaseAdminClient();
  const { data: project, error: projectError } = await admin.from("studio_projects").select("id").eq("id", projectId).eq("owner_id", profile.userId).maybeSingle();
  // A failed lookup must not skip the send check (fail closed), only a real "not yours / missing".
  if (projectError) {
    return NextResponse.json({ error: "Nie udało się sprawdzić limitu wysyłek." }, { status: 500 });
  }
  if (!project) return null;
  // p_send_id only when the recorder sent one, so older builds keep the 2-arg call shape.
  const args = sendId
    ? { p_owner_id: profile.userId, p_project_id: projectId, p_send_id: sendId }
    : { p_owner_id: profile.userId, p_project_id: projectId };
  const { data, error } = await admin.rpc("use_desktop_studio_send", args);
  if (error) {
    return NextResponse.json({ error: "Nie udało się sprawdzić limitu wysyłek." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "desktop_send_limit", code: "DESKTOP_SEND_REQUIRED" }, { status: 429 });
  }
  return null;
}

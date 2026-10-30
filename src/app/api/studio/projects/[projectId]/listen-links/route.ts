import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { createListenLink, listListenLinks, ListenLinksUnavailable, revokeListenLink } from "@/lib/studio/listen/listen-server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { getSiteUrl } from "@/lib/site-url";

import { readJson, tierOf } from "../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

const DENY: Record<string, number> = { not_approved: 409, limit: 403, bad_days: 400 };

function errorResponse(error: unknown) {
  if (error instanceof ListenLinksUnavailable) return NextResponse.json({ success: true, available: false });
  return studioApiErrorResponse(error);
}

/** GET — this project's listen links + plan limits (active / max / lifetime options). */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    return NextResponse.json({ success: true, tier, ...(await listListenLinks({ ownerId: auth.userId, projectId, tier, origin: getSiteUrl() })) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST { days } — new link to the approved master (403 limit, 409 not_approved). */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const tier = await tierOf(auth);
    const r = await createListenLink({ ownerId: auth.userId, projectId, tier, days: body.days, origin: getSiteUrl() });
    return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 201 : DENY[r.error] ?? 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE { linkId } — revoke (idempotent). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    const r = await revokeListenLink({ ownerId: auth.userId, projectId, linkId: String(body?.linkId ?? "") });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    return errorResponse(error);
  }
}

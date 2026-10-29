import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { commitStudioDeliver, prepareStudioDeliver } from "@/lib/studio/master/server";

import { DENY_STATUS, masterErrorResponse, readJson, tierOf } from "../master/_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * POST — downloads, enforced here (tier from the server entitlement, never from the client):
 *   {action:"prepare", kind, format} → jobId (+ upload URL for browser-rendered mix/raw)
 *   {action:"stem", jobId, name}     → upload URL for one Projekt stem (Gold only, re-checked on commit)
 *   {action:"commit", jobId, kind, format} → quota consumed atomically, job queued
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    const tier = await tierOf(auth);
    const base = { ownerId: auth.userId, projectId, tier, kind: body.kind, format: body.format };
    if (body.action === "prepare") {
      const r = await prepareStudioDeliver(base);
      return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 200 : DENY_STATUS[r.error] ?? 400 });
    }
    if (body.action === "commit") {
      const r = await commitStudioDeliver({ ...base, jobId: String(body.jobId ?? ""), documentVersion: body.documentVersion });
      return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 202 : DENY_STATUS[r.error] ?? 400 });
    }
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

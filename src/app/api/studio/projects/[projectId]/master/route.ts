import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { deliverOptions } from "@/lib/studio/deliver/policy";
import { commitStudioMaster, getStudioMasterState, prepareStudioMaster } from "@/lib/studio/master/server";

import { DENY_STATUS, masterErrorResponse, readJson, tierOf } from "./_shared";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectId: string }> };

/** GET — latest master job, approved master, tier + download options + Free weekly counter. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const tier = await tierOf(auth);
    const state = await getStudioMasterState({ ownerId: auth.userId, projectId, tier });
    return NextResponse.json({ success: true, tier, options: deliverOptions(tier), ...state });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

/** POST {action:"prepare"} → jobId + signed upload; {action:"commit", jobId, target, settings} → queued on E3. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    if (body.action === "prepare") return NextResponse.json({ success: true, ...(await prepareStudioMaster({ ownerId: auth.userId, projectId })) });
    if (body.action === "commit") {
      const r = await commitStudioMaster({ ownerId: auth.userId, projectId, jobId: String(body.jobId ?? ""), target: body.target, settings: body.settings });
      return NextResponse.json({ success: r.ok, ...r }, { status: r.ok ? 202 : DENY_STATUS[r.error] ?? 400 });
    }
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  } catch (error) {
    return masterErrorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { bitekMemoryForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { requireUser } from "@/lib/auth/session";
import { parseBitekMessageInputs } from "@/lib/studio/bitek/store/messages";
import { appendBitekMessages, listBitekMessages } from "@/lib/studio/bitek/store/server";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * GET — BITEK history + notes + bubble state of an owned project.
 * `memory` (plan-policy): "session" plans get no saved chat rows back — the
 * conversation lives in the browser tab; notes / fixes / state stay.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    const [result, entitlement] = await Promise.all([
      listBitekMessages({ ownerId: auth.userId, projectId }),
      resolveProductEntitlementForAuthContext(auth),
    ]);
    const memory = bitekMemoryForTier(entitlement.premiumTier);
    const messages = memory === "project" ? result.messages : result.messages.filter((m) => m.kind !== "chat");
    return NextResponse.json({ success: true, ...result, messages, memory });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** POST — append BITEK notes (welcome / note / fix / state). Chat rows are written by the chat route. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const auth = await requireUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "bad_body" }, { status: 400 });
    }
    const parsed = parseBitekMessageInputs(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await appendBitekMessages({ ownerId: auth.userId, projectId, rows: parsed.rows });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

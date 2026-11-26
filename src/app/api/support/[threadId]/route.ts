import { after } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { foreignOrigin, readJson, reply } from "@/lib/support/support-http";
import { mailStaff } from "@/lib/support/support-notify";
import { cleanBody } from "@/lib/support/support-policy";
import { openOwnConversation, postUserMessage } from "@/lib/support/support-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ threadId: string }> };

/** The open chat polls this; opening marks the staff's replies as read. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getCurrentProfile();
    if (!session) return reply("signed_out");
    const conversation = await openOwnConversation(session.userId, (await context.params).threadId);
    return conversation ? reply("ok", conversation) : reply("missing");
  } catch {
    return reply("error");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    if (foreignOrigin(request)) return reply("forbidden");
    const session = await getCurrentProfile();
    if (!session) return reply("signed_out");
    const body = cleanBody((await readJson(request)).body);
    if (!body) return reply("invalid");
    const posted = await postUserMessage(session.userId, (await context.params).threadId, body);
    if (posted.result !== "ok") return reply(posted.result);
    if (posted.notify) after(() => mailStaff(posted, body));
    return reply("ok");
  } catch {
    return reply("error");
  }
}

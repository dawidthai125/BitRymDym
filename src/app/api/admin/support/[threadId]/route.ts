import { after } from "next/server";

import { AuthError, requireRole } from "@/lib/auth/session";
import { foreignOrigin, readJson, reply } from "@/lib/support/support-http";
import { mailUser } from "@/lib/support/support-notify";
import { cleanBody } from "@/lib/support/support-policy";
import { openStaffConversation, postStaffMessage, setThreadStatus } from "@/lib/support/support-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ threadId: string }> };

/** ADMIN only: these conversations carry private data. */
async function asAdmin(work: (staffId: string) => Promise<Response>): Promise<Response> {
  try {
    const context = await requireRole(["ADMIN"]);
    return await work(context.userId);
  } catch (error) {
    if (error instanceof AuthError) return reply(error.code === "UNAUTHENTICATED" ? "signed_out" : "forbidden");
    return reply("error");
  }
}

export function GET(_request: Request, context: RouteContext) {
  return asAdmin(async () => {
    const conversation = await openStaffConversation((await context.params).threadId);
    return conversation ? reply("ok", { thread: conversation.thread, messages: conversation.messages }) : reply("missing");
  });
}

export function POST(request: Request, context: RouteContext) {
  return asAdmin(async (staffId) => {
    if (foreignOrigin(request)) return reply("forbidden");
    const body = cleanBody((await readJson(request)).body);
    if (!body) return reply("invalid");
    const posted = await postStaffMessage(staffId, (await context.params).threadId, body);
    if (posted.result !== "ok") return reply(posted.result);
    if (posted.notify) after(() => mailUser(posted, body));
    return reply("ok");
  });
}

/** Close or reopen. A new message from either side reopens the thread. */
export function PATCH(request: Request, context: RouteContext) {
  return asAdmin(async () => {
    if (foreignOrigin(request)) return reply("forbidden");
    const status = (await readJson(request)).status;
    if (status !== "open" && status !== "closed") return reply("invalid");
    return (await setThreadStatus((await context.params).threadId, status)) ? reply("ok") : reply("missing");
  });
}

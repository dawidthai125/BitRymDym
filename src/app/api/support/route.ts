import { after } from "next/server";

import { getCurrentProfile } from "@/lib/auth/session";
import { foreignOrigin, readJson, reply } from "@/lib/support/support-http";
import { mailStaff } from "@/lib/support/support-notify";
import { cleanNewThread } from "@/lib/support/support-policy";
import { createThread } from "@/lib/support/support-service";

export const runtime = "nodejs";

/** New feedback / bug report: `{ kind, subject, body, page? }`. Signed-in accounts only. */
export async function POST(request: Request) {
  try {
    if (foreignOrigin(request)) return reply("forbidden");
    const session = await getCurrentProfile();
    if (!session) return reply("signed_out");
    const input = cleanNewThread(await readJson(request));
    if (!input) return reply("invalid");
    const posted = await createThread(session.userId, input, request.headers.get("user-agent"));
    if (posted.result !== "ok") return reply(posted.result);
    if (posted.notify) after(() => mailStaff(posted, input.body));
    return reply("ok", { threadId: posted.threadId });
  } catch {
    return reply("error");
  }
}

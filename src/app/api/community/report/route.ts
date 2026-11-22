import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { reportComment } from "@/lib/community/comment-moderation";

export const runtime = "nodejs";

/**
 * A signed-in member reports a comment (DSA art. 16 notice).
 * Body: `{ id, reason, details? }`. A repeat report is idempotent: 200 `{ result: "already" }`.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown; details?: unknown };
    const result = await reportComment(auth.userId, body.id, body.reason, body.details);
    const status =
      result === "ok" || result === "already"
        ? 200
        : result === "own"
          ? 403
          : result === "missing"
            ? 404
            : result === "limit"
              ? 429
              : result === "off"
                ? 503
                : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ result: "invalid" }, { status: 401 });
    }
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}

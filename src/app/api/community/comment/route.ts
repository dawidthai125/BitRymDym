import { NextResponse } from "next/server";

import { engageKind } from "@/lib/catalog/catalog-policy";
import { AuthError, requireUser } from "@/lib/auth/session";
import { deleteOwnComment, hideComment } from "@/lib/community/comment-moderation";
import { commentTarget } from "@/lib/community/community-service";

export const runtime = "nodejs";

function moderationStatus(result: string): number {
  if (result === "ok") return 200;
  if (result === "forbidden") return 403;
  if (result === "missing") return 404;
  if (result === "off") return 503;
  return 400;
}

function failure(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ result: "invalid" }, { status: 401 });
  }
  return NextResponse.json({ result: "invalid" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as { kind?: unknown; id?: unknown; body?: unknown };
    const kind = engageKind(body.kind);
    if (!kind || typeof body.id !== "string") {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const { result, id } = await commentTarget(auth.userId, kind, body.id, body.body);
    const status = result === "ok" ? 200 : result === "missing" ? 404 : result === "closed" ? 403 : result === "limit" ? 429 : result === "off" ? 503 : 400;
    return NextResponse.json(id ? { result, id } : { result }, { status });
  } catch (error) {
    return failure(error);
  }
}

/** The author removes their own comment (soft delete). Body: `{ id }`. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const result = await deleteOwnComment(auth.userId, body.id);
    return NextResponse.json({ result }, { status: moderationStatus(result) });
  } catch (error) {
    return failure(error);
  }
}

/** The work's owner or staff hides a comment. Body: `{ id, action: "hide" }`. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
    if (body.action !== "hide") return NextResponse.json({ result: "invalid" }, { status: 400 });
    const result = await hideComment(
      { userId: auth.userId, role: auth.profile.role, userNumber: auth.profile.userNumber },
      body.id,
    );
    return NextResponse.json({ result }, { status: moderationStatus(result) });
  } catch (error) {
    return failure(error);
  }
}

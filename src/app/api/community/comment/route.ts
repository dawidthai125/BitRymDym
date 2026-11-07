import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { commentTarget } from "@/lib/community/community-service";
import type { TargetKind } from "@/lib/community/ranking-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as { kind?: unknown; id?: unknown; body?: unknown };
    const kind: TargetKind | null = body.kind === "beat" || body.kind === "sample" ? body.kind : null;
    if (!kind || typeof body.id !== "string") {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const result = await commentTarget(auth.userId, kind, body.id, body.body);
    const status = result === "ok" ? 200 : result === "missing" ? 404 : result === "closed" ? 403 : result === "limit" ? 429 : result === "off" ? 503 : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ result: "invalid" }, { status: 401 });
    }
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}

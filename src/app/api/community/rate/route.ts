import { NextResponse } from "next/server";

import { engageKind } from "@/lib/catalog/catalog-policy";
import { AuthError, requireUser } from "@/lib/auth/session";
import { rateTarget } from "@/lib/community/community-service";

export const runtime = "nodejs";

function kindOf(value: unknown) {
  return engageKind(value);
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as { kind?: unknown; id?: unknown; stars?: unknown };
    const kind = kindOf(body.kind);
    if (!kind || typeof body.id !== "string") {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const result = await rateTarget(auth.userId, kind, body.id, Number(body.stars));
    const status = result === "ok" ? 200 : result === "missing" ? 404 : result === "closed" ? 403 : result === "off" ? 503 : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ result: "invalid" }, { status: 401 });
    }
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}

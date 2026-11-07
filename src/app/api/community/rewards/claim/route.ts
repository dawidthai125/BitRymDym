import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { claimMyReward } from "@/lib/community/community-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string") {
      return NextResponse.json({ result: "invalid" }, { status: 400 });
    }
    const result = await claimMyReward(auth.userId, body.id);
    const status = result === "ok" || result === "already" ? 200 : result === "off" ? 503 : result === "missing" ? 404 : 409;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ result: "invalid" }, { status: 401 });
    }
    return NextResponse.json({ result: "conflict" }, { status: 500 });
  }
}

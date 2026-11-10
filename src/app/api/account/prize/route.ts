import { NextResponse } from "next/server";

import { activateWorkPrize, resumeWorkPlan } from "@/lib/catalog/catalog-prize-service";
import { AuthError, requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json()) as { action?: unknown; accept?: unknown };
    if (body.accept !== true) return NextResponse.json({ result: "invalid" }, { status: 400 });
    const result = body.action === "activate"
      ? await activateWorkPrize(auth.userId, true)
      : body.action === "resume"
        ? await resumeWorkPlan(auth.userId, true)
        : "invalid";
    const status = result === "ok" ? 200
      : result === "missing" ? 404
        : result === "off" ? 503
          : result === "perpetual" || result === "already" || result === "wait" ? 409
            : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ result: "invalid" }, { status: 401 });
    return NextResponse.json({ result: "invalid" }, { status: 500 });
  }
}

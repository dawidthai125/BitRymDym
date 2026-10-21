import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import {
  PremiumUnlockError,
  unlockPremiumWorkFor,
} from "@/lib/premium/premium-unlock-service";

/**
 * POST /api/premium/unlock
 * Body: { workId, idempotencyKey }
 * Server derives credits/tier/retention — client must not supply them.
 */
export async function POST(request: Request) {
  try {
    const context = await requireUser();
    const body = (await request.json()) as {
      workId?: unknown;
      idempotencyKey?: unknown;
      premiumTier?: unknown;
      credits?: unknown;
    };
    if (body.premiumTier != null || body.credits != null) {
      return NextResponse.json(
        {
          success: false,
          error: "Client must not supply premiumTier/credits.",
        },
        { status: 400 },
      );
    }
    const result = await unlockPremiumWorkFor(context, {
      workId: String(body.workId ?? ""),
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    if (error instanceof PremiumUnlockError) {
      const status =
        error.code === "UNAVAILABLE"
          ? 503
          : error.code === "NO_CREDITS" || error.code === "KEY_REUSE"
            ? 409
            : error.code === "WORK_NOT_FOUND"
              ? 404
              : 403;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }
    return NextResponse.json(
      { success: false, error: "Unlock failed." },
      { status: 500 },
    );
  }
}

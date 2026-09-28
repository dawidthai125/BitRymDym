import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { revokeBeatAccessGrantFor } from "@/lib/grants/beat-access-grants";

export const runtime = "nodejs";

function authStatus(error: AuthError): number {
  if (error.code === "UNAUTHENTICATED") return 401;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT") return 409;
  return 403;
}

type RouteContext = {
  params: Promise<{ id: string; grantId: string }>;
};

/**
 * Wave 5 — owner soft-revoke grant.
 * POST /api/beats/[id]/grants/[grantId]/revoke
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id: beatId, grantId } = await context.params;
    const auth = await requireUser();
    await revokeBeatAccessGrantFor(auth, { beatId, grantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: authStatus(error) },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Revoke grant failed.",
      },
      { status: 400 },
    );
  }
}

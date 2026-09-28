import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { listActiveGranteeGrantsFor } from "@/lib/grants/beat-access-grants";

export const runtime = "nodejs";

/**
 * Wave 5 — grantee list ACTIVE RECORD grants ("Bity udostępnione").
 * GET /api/account/grants
 */
export async function GET() {
  try {
    const auth = await requireUser();
    const grants = await listActiveGranteeGrantsFor(auth);
    return NextResponse.json({ success: true, grants });
  } catch (error) {
    if (error instanceof AuthError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "NOT_FOUND"
            ? 404
            : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "List grants failed." },
      { status: 400 },
    );
  }
}

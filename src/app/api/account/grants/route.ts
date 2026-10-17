import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { beatApiErrorResponse } from "@/lib/beats/beat-operation-error";
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
    return beatApiErrorResponse(error, "api/account/grants");
  }
}

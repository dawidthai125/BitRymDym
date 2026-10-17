import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import { revokeBeatAccessGrantFor } from "@/lib/grants/beat-access-grants";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; grantId: string }>;
};

/**
 * Wave 5 — owner soft-revoke grant (idempotent: an already revoked grant
 * returns success without a write).
 * POST /api/beats/[id]/grants/[grantId]/revoke
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { id: beatId, grantId } = await context.params;
    if (!isUuid(beatId) || !isUuid(grantId)) {
      return beatApiBadRequest("Beat id and grant id must be uuids.");
    }
    await revokeBeatAccessGrantFor(auth, { beatId, grantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return beatApiErrorResponse(error, "api/beats/[id]/grants/[grantId]/revoke");
  }
}

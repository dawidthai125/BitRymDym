import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  beatApiBadRequest,
  beatApiErrorResponse,
} from "@/lib/beats/beat-operation-error";
import {
  createBeatAccessGrantForGrantee,
  listOwnerBeatAccessGrantsFor,
  rejectGrantClientPrivilegeFields,
} from "@/lib/grants/beat-access-grants";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Wave 5 — owner list grants for owned beat.
 * GET /api/beats/[id]/grants
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { id: beatId } = await context.params;
    if (!isUuid(beatId)) {
      return beatApiBadRequest("Beat id must be a uuid.");
    }
    const grants = await listOwnerBeatAccessGrantsFor(auth, beatId);
    return NextResponse.json({ success: true, grants });
  } catch (error) {
    return beatApiErrorResponse(error, "api/beats/[id]/grants GET");
  }
}

/**
 * Wave 5 — owner create RECORD grant.
 * POST /api/beats/[id]/grants
 * Body: { granteeUserId | grantee } + optional expiresAt
 * Privilege fields rejected. Server forces can_record=true.
 * Input (including expiresAt) is validated before any query; the grantee
 * lookup runs only after ownership of the beat is proven (service).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireUser();
    const { id: beatId } = await context.params;
    if (!isUuid(beatId)) {
      return beatApiBadRequest("Beat id must be a uuid.");
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return beatApiBadRequest("JSON object body is required.");
    }
    const fields = body as Record<string, unknown>;
    rejectGrantClientPrivilegeFields(fields);

    const rawGrantee =
      typeof fields.granteeUserId === "string"
        ? fields.granteeUserId
        : typeof fields.grantee === "string"
          ? fields.grantee
          : null;
    if (!rawGrantee || !rawGrantee.trim()) {
      return beatApiBadRequest("granteeUserId (or grantee) is required.");
    }
    const result = await createBeatAccessGrantForGrantee(auth, {
      beatId,
      grantee: rawGrantee,
      expiresAt: fields.expiresAt,
    });

    return NextResponse.json({ success: true, grantId: result.grantId });
  } catch (error) {
    return beatApiErrorResponse(error, "api/beats/[id]/grants POST");
  }
}

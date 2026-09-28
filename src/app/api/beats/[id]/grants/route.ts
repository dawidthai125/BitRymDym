import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import {
  createBeatAccessGrantFor,
  listOwnerBeatAccessGrantsFor,
  rejectGrantClientPrivilegeFields,
  resolveGranteeUserId,
} from "@/lib/grants/beat-access-grants";

export const runtime = "nodejs";

function authStatus(error: AuthError): number {
  if (error.code === "UNAUTHENTICATED") return 401;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT") return 409;
  return 403;
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Wave 5 — owner list grants for owned beat.
 * GET /api/beats/[id]/grants
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: beatId } = await context.params;
    const auth = await requireUser();
    const grants = await listOwnerBeatAccessGrantsFor(auth, beatId);
    return NextResponse.json({ success: true, grants });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: authStatus(error) },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "List grants failed." },
      { status: 400 },
    );
  }
}

/**
 * Wave 5 — owner create RECORD grant.
 * POST /api/beats/[id]/grants
 * Body: { granteeUserId | grantee } + optional expiresAt
 * Privilege fields rejected. Server forces can_record=true.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: beatId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    rejectGrantClientPrivilegeFields(body);

    const rawGrantee =
      typeof body.granteeUserId === "string"
        ? body.granteeUserId
        : typeof body.grantee === "string"
          ? body.grantee
          : null;
    if (!rawGrantee) {
      return NextResponse.json(
        { error: "granteeUserId (or grantee) is required." },
        { status: 400 },
      );
    }

    const expiresAt =
      body.expiresAt === null || body.expiresAt === undefined
        ? null
        : typeof body.expiresAt === "string"
          ? body.expiresAt
          : null;
    if (body.expiresAt != null && typeof body.expiresAt !== "string") {
      return NextResponse.json(
        { error: "expiresAt must be an ISO string or null." },
        { status: 400 },
      );
    }

    const granteeUserId = await resolveGranteeUserId(rawGrantee);
    const result = await createBeatAccessGrantFor(auth, {
      beatId,
      granteeUserId,
      expiresAt,
    });

    return NextResponse.json({ success: true, grantId: result.grantId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: authStatus(error) },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Create grant failed.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth/session";
import {
  httpStatusForMixWorkingApplyError,
  MixWorkingApplyError,
} from "@/lib/studio/mix-working/mix-working-apply-errors";
import {
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import {
  StudioBeatTrackProtectedError,
  StudioTrackCapacityError,
} from "@/lib/studio/studio-track-capacity";
import { StudioProjectLimitError } from "@/lib/studio/studio-plan-limits";
import { studioValidationMessage } from "@/lib/studio/studio-validation-error";

/** The only text a client sees for an unknown server error. */
export const STUDIO_INTERNAL_ERROR = "Coś poszło nie tak na serwerze. Spróbuj ponownie za chwilę.";

export function studioApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof StudioProjectLimitError) {
    return NextResponse.json(
      { error: error.message, code: error.code, limit: error.limit, tier: error.tier },
      { status: 403 },
    );
  }
  if (error instanceof MixWorkingApplyError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: httpStatusForMixWorkingApplyError(error.code) },
    );
  }
  if (error instanceof StudioFxCasConflictError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 409 },
    );
  }
  if (error instanceof StudioTrackCapacityError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 403 },
    );
  }
  if (error instanceof StudioBeatTrackProtectedError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 403 },
    );
  }
  if (error instanceof Error && error.name === "StudioPlanFeatureError") {
    const locked = error as Error & { code?: string; feature?: string; tier?: string; requiredTier?: string };
    return NextResponse.json(
      {
        error: locked.message,
        code: locked.code ?? "PLAN_FEATURE_LOCKED",
        feature: locked.feature,
        tier: locked.tier,
        requiredTier: locked.requiredTier,
      },
      { status: 403 },
    );
  }
  if (error instanceof StudioFxChainError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 },
    );
  }
  if (error instanceof AuthError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  const invalid = studioValidationMessage(error);
  if (invalid) {
    return NextResponse.json({ error: invalid, code: "VALIDATION" }, { status: 400 });
  }
  // Unknown (database, network, bug): the detail stays in the server log. 500 lets autosave retry (writes are CAS).
  console.error("[studio-api] unexpected error", error);
  return NextResponse.json(
    { error: STUDIO_INTERNAL_ERROR, code: "INTERNAL" },
    { status: 500 },
  );
}

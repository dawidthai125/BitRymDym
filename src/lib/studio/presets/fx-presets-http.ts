import "server-only";

import { NextResponse } from "next/server";

import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";

import { StudioPlanFeatureError } from "./fx-presets-server";
import { FxPresetValidationError } from "./vocal-presets";

export function fxPresetErrorResponse(error: unknown): NextResponse {
  if (error instanceof StudioPlanFeatureError) {
    return NextResponse.json(
      { error: error.message, code: error.code, feature: error.feature, tier: error.tier, requiredTier: error.requiredTier },
      { status: 403 },
    );
  }
  if (error instanceof FxPresetValidationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  return studioApiErrorResponse(error);
}

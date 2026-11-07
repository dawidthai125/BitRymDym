import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { deleteFxPreset, publishFxPreset } from "@/lib/studio/presets/fx-presets-server";
import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ presetId: string }> };

/** POST — list this preset on the exchange. Owner only. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { presetId } = await context.params;
    const auth = await requireUser();
    await publishFxPreset(auth, presetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

/** DELETE — remove an own preset (allowed on every plan, also after a downgrade). */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { presetId } = await context.params;
    const auth = await requireUser();
    await deleteFxPreset(auth, presetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

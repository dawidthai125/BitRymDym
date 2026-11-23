import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { deleteFxPreset, publishFxPreset } from "@/lib/studio/presets/fx-presets-server";
import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ presetId: string }> };

/** POST — list this preset on the exchange; { listed: false } takes it back. Owner only. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { presetId } = await context.params;
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { listed?: unknown } | null;
    await publishFxPreset(auth, presetId, body?.listed !== false);
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

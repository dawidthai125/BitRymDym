import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { copyListedFxPreset, listListedFxPresets } from "@/lib/studio/presets/fx-presets-server";
import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";

export const runtime = "nodejs";

/** GET — listed presets only. No owner id. */
export async function GET() {
  try {
    await requireUser();
    const presets = await listListedFxPresets();
    return NextResponse.json({ success: true, presets });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

/** POST { id } — copy a listed preset into the caller's own list. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
    const preset = await copyListedFxPreset(auth, typeof body?.id === "string" ? body.id : "");
    return NextResponse.json({ success: true, preset }, { status: 201 });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

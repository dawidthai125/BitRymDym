import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { createFxPreset, listFxPresets } from "@/lib/studio/presets/fx-presets-server";
import { fxPresetErrorResponse } from "@/lib/studio/presets/fx-presets-http";

export const runtime = "nodejs";

/** GET — own vocal presets + what the plan allows (plan-policy). */
export async function GET() {
  try {
    const auth = await requireUser();
    const result = await listFxPresets(auth);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

/** POST { name, kind: "chain"|"set", payload } — Silver+ (sets: Gold). */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    let body: { name?: unknown; kind?: unknown; payload?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "bad_body" }, { status: 400 });
    }
    const preset = await createFxPreset(auth, { name: body?.name, kind: body?.kind, payload: body?.payload });
    return NextResponse.json({ success: true, preset }, { status: 201 });
  } catch (error) {
    return fxPresetErrorResponse(error);
  }
}

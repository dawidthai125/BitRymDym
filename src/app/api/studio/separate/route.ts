import { existsSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SEPARATE_SCRIPT = path.join(process.cwd(), "scripts", "studio", "separate_stems.py");

/** POST { projectId } — accept a 4-stem job for the worker host. Does not run Demucs. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!PROJECT_ID.test(projectId)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("studio_projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", auth.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
    }

    const demucsPython = process.env.DEMUCS_PYTHON?.trim() ?? "";
    if (!demucsPython || !existsSync(SEPARATE_SCRIPT)) {
      return NextResponse.json({ error: "separator_unconfigured" }, { status: 503 });
    }

    // Worker host runs scripts/studio/separate_stems.py. Nothing heavy starts here.
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

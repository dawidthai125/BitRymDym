import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET — this user's requests. Does not invent an answer. */
export async function GET() {
  try {
    const auth = await requireUser();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("studio_engineer_requests")
      .select("id, body, status, answer, created_at")
      .eq("owner_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

/** POST { body } — store an open engineer request. Does not write an answer. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (body.length < 4 || body.length > 2000) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("studio_engineer_requests").insert({
      owner_id: auth.userId,
      project_id: null,
      body,
      status: "open",
      answer: null,
    });
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return studioApiErrorResponse(error);
  }
}

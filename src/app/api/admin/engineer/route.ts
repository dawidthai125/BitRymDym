import { NextResponse } from "next/server";

import { AuthError, requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** POST { id, answer } — human reply on an open request. Does not create one. */
export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const payload = (await request.json().catch(() => null)) as {
      id?: unknown;
      answer?: unknown;
    } | null;
    const id = payload?.id;
    const answer = typeof payload?.answer === "string" ? payload.answer.trim() : "";
    if (!isUuid(id) || answer.length < 1 || answer.length > 2000) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("studio_engineer_requests")
      .update({ status: "answered", answer })
      .eq("id", id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "not_open" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.code }, { status });
    }
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}

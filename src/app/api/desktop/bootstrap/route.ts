import { NextResponse } from "next/server";

import { listPublishedBeats } from "@/lib/beats/service";
import { desktopBootstrapBody } from "@/lib/recorder/desktop-bootstrap";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

/** Public client for the Windows recorder. No service role and no audio file. */
export async function GET() {
  const { url, anonKey } = getSupabasePublicEnv();
  let beats: { id: string; title: string; bpm: number }[] = [];
  try {
    const rows = await listPublishedBeats();
    beats = rows.map((beat) => ({
      id: beat.id,
      title: beat.title,
      bpm: beat.bpm,
    }));
  } catch {
    beats = [];
  }
  try {
    return NextResponse.json({
      success: true,
      ...desktopBootstrapBody({ supabaseUrl: url, anonKey, beats }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Klient publiczny nie jest ustawiony.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

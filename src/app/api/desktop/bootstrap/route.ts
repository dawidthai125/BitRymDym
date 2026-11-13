import { NextResponse } from "next/server";

import { listPublishedBeats } from "@/lib/beats/service";
import { desktopBootstrapBody, type DesktopBeatChoice } from "@/lib/recorder/desktop-bootstrap";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

/** Public client for the Windows recorder. No service role and no audio file. */
export async function GET() {
  const { url, anonKey } = getSupabasePublicEnv();
  let beats: DesktopBeatChoice[] = [];
  try {
    const rows = await listPublishedBeats();
    beats = rows.map((beat) => ({
      id: beat.id,
      title: beat.title,
      bpm: beat.bpm,
      durationSeconds: beat.durationSeconds ?? 0,
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

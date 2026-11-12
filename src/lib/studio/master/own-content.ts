/**
 * Owner rule (2026-11-12): nobody can export the clean Bit. A project may be mixed, mastered or delivered only
 * when it holds something the user made: a recorded take, an imported stem/sample, or instrument notes.
 * A project with only the Bit (BEAT_REF) clip must not produce a mix, master or file.
 */
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasMidi, readMidi } from "@/lib/studio/studio-midi";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type OwnContentClip = { source_kind: string; muted: boolean | null; duration_ms: number | null };
export type OwnContentTrack = { midi: unknown };

/** Pure: true when the project holds at least one thing that is not just the Bit. */
export function hasOwnContent(clips: readonly OwnContentClip[], tracks: readonly OwnContentTrack[]): boolean {
  const clip = clips.some(
    (c) => (c.source_kind === "TAKE" || c.source_kind === "ARTIFACT") && c.muted !== true && Number(c.duration_ms ?? 0) > 0,
  );
  if (clip) return true;
  return tracks.some((t) => hasMidi(readMidi(t.midi)));
}

/** Server check for one project (service role; caller already verified ownership). */
export async function projectHasOwnContent(admin: Admin, projectId: string): Promise<boolean> {
  const { data: tracks, error: te } = await admin.from("studio_tracks").select("id, midi").eq("project_id", projectId);
  if (te) throw new Error(te.message);
  const rows = (tracks as Array<{ id: string; midi: unknown }> | null) ?? [];
  if (rows.length === 0) return false;
  const { data: clips, error: ce } = await admin
    .from("studio_clips")
    .select("source_kind, muted, duration_ms")
    .in("track_id", rows.map((r) => r.id));
  if (ce) throw new Error(ce.message);
  return hasOwnContent((clips as OwnContentClip[] | null) ?? [], rows);
}

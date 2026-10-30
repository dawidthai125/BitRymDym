import "server-only";

/**
 * Data for share cards. Covers only when publicly visible (approved + public catalogue) —
 * a crawler has no session, and a private beat's cover must never leak through a card.
 */
import { loadBeatCoverForViewer } from "@/lib/beats/cover/cover-service";
import { toPublicBeatDetail } from "@/lib/beats/public";
import { getPublishedBeat } from "@/lib/beats/service";
import { resolveListenToken } from "@/lib/studio/listen/listen-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { presentBeat } from "@/lib/ui/demo-beats";

import { clampText } from "./share-links";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function publicCover(beatId: string | null | undefined): Promise<Uint8Array | null> {
  if (!beatId || !UUID.test(beatId)) return null;
  const c = await loadBeatCoverForViewer(beatId, "full").catch(() => null);
  return c && c.publicCache ? new Uint8Array(c.bytes) : null;
}

export type ShareCardData = { title: string; meta: string | null; cover: Uint8Array | null };

export async function beatShareData(beatId: string): Promise<ShareCardData | null> {
  if (!UUID.test(beatId)) return null;
  const beat = await getPublishedBeat(beatId).catch(() => null);
  if (!beat) return null;
  const p = presentBeat(toPublicBeatDetail(beat));
  const meta = [beat.bpm ? `${beat.bpm} BPM` : null, beat.genre, beat.producer].filter(Boolean).join(" · ");
  return { title: clampText(p.title, 70), meta: clampText(meta, 60) || null, cover: await publicCover(beatId) };
}

export async function listenShareData(token: string): Promise<ShareCardData | null> {
  const link = await resolveListenToken(token).catch(() => null);
  if (!link) return null;
  let beatId: string | null = null;
  if (link.projectId) {
    const { data } = await createSupabaseAdminClient().from("studio_projects").select("beat_id").eq("id", link.projectId).maybeSingle();
    beatId = ((data as { beat_id?: string | null } | null)?.beat_id ?? null) as string | null;
  }
  return { title: clampText(link.title, 70), meta: null, cover: await publicCover(beatId) };
}

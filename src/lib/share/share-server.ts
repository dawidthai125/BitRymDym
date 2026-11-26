import "server-only";

/**
 * Data for share cards. Covers only when publicly visible (approved + public catalogue) —
 * a crawler has no session, and a private beat's cover must never leak through a card.
 */
import { loadBeatCoverForViewer } from "@/lib/beats/cover/cover-service";
import { toPublicBeatDetail } from "@/lib/beats/public";
import { getPublishedBeat } from "@/lib/beats/service";
import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { lookupListenToken } from "@/lib/studio/listen/listen-server";
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

export async function listenShareData(token: string, clientIp: string): Promise<ShareCardData | null> {
  // Same guessing limit as the page: a share card must not tell valid tokens apart faster than the page does.
  const lookup = await lookupListenToken(token, clientIp).catch(() => null);
  if (lookup?.status !== "ok") return null;
  const link = lookup.link;
  return { title: clampText(link.title, 70), meta: null, cover: await publicCover(await projectBeatId(link.projectId)) };
}

/** Beat behind a Studio project (its cover goes on the card, still only when public). */
export async function projectBeatId(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId || !UUID.test(projectId)) return null;
  const { data } = await createSupabaseAdminClient().from("studio_projects").select("beat_id").eq("id", projectId).maybeSingle();
  return ((data as { beat_id?: string | null } | null)?.beat_id ?? null) as string | null;
}

/**
 * Finished track (/utwor/[id]). Visibility = `findLiveCatalogWork` (same gate as the page):
 * withdrawn or unknown → null → neutral brand card. Cover = the track's beat cover, only when public.
 */
export async function workShareData(workId: string): Promise<ShareCardData | null> {
  const work = await findLiveCatalogWork(workId).catch(() => null);
  if (!work) return null;
  let beatId: string | null = null;
  try {
    const { data } = await createSupabaseAdminClient().from("catalog_works").select("project_id").eq("id", work.id).maybeSingle();
    beatId = await projectBeatId((data as { project_id?: string | null } | null)?.project_id);
  } catch {
    beatId = null;
  }
  return { title: clampText(work.title, 70), meta: clampText(work.author, 60) || null, cover: await publicCover(beatId) };
}

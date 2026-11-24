import "server-only";

import { creatorPath } from "@/lib/creators/creator-slug";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Which authors have a public profile. One call per list, remembered for 30 s per server instance,
 * so a page with a list, comments and related rows does not ask three times. A profile that was
 * turned off answers 404 at once (the page itself is not cached); only its link can live these 30 s.
 */
const TTL_MS = 30_000;
const MAX_KEYS = 5_000;
const MAX_IDS = 1_000;

let memory = new Map<string, { until: number; publicId: string | null }>();

export function forgetCreatorHref(ownerId: string): void {
  memory.delete(ownerId);
}

export function resetCreatorHrefsForTests(): void {
  memory = new Map();
}

/** Account id → public id, only for profiles that are on. Any failure (table not there yet) = no links. */
export async function loadCreatorIds(ownerIds: readonly (string | null | undefined)[], now = Date.now()): Promise<Map<string, string>> {
  const unique = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))].slice(0, MAX_IDS);
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const id of unique) {
    const known = memory.get(id);
    if (!known || known.until <= now) missing.push(id);
    else if (known.publicId) out.set(id, known.publicId);
  }
  if (missing.length === 0) return out;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("public_profile_ids", { p_ids: missing });
    if (!error) {
      for (const row of (data ?? []) as { owner_id: string; public_id: string }[]) out.set(row.owner_id, row.public_id);
    }
  } catch {
    // No service key or no network: names stay text.
  }
  if (memory.size + missing.length > MAX_KEYS) memory = new Map();
  for (const id of missing) memory.set(id, { until: now + TTL_MS, publicId: out.get(id) ?? null });
  return out;
}

/** Link of an author, or null (profile off, no ksywka, house account). */
export function creatorHref(ids: ReadonlyMap<string, string>, ownerId: string | null | undefined, name: string | null | undefined): string | null {
  return ownerId ? creatorPath(ids.get(ownerId), name) : null;
}

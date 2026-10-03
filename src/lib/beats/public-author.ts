import "server-only";

import type { Beat } from "@/types/domain";
import { resolvePublicAuthor } from "@/lib/beats/public-author-resolve";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export { resolvePublicAuthor } from "@/lib/beats/public-author-resolve";

/**
 * Batch-load public display names for owner UUIDs via SECURITY DEFINER RPC
 * (profiles RLS would otherwise hide foreign display_name from anon).
 */
export async function loadPublicAuthorDisplayNames(
  ownerIds: readonly string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ownerIds.filter(Boolean))];
  const out = new Map<string, string | null>();
  if (unique.length === 0) return out;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_author_display_names", {
    p_ids: unique,
  });

  if (error) {
    // Fail closed to producer fallback — do not throw on public catalog.
    return out;
  }

  for (const row of data ?? []) {
    const id = row.id as string;
    const name = (row.display_name as string | null) ?? null;
    out.set(id, name);
  }
  return out;
}

/** Apply public author SSOT onto Beat.producer for public surfaces. */
export async function withPublicAuthors(
  beats: readonly Beat[],
): Promise<Beat[]> {
  const ownerIds = beats
    .filter((b) => b.ownershipType === "USER" && b.ownerId)
    .map((b) => b.ownerId!);
  const names = await loadPublicAuthorDisplayNames(ownerIds);

  return beats.map((beat) => {
    const author = resolvePublicAuthor({
      ownershipType: beat.ownershipType,
      ownerId: beat.ownerId,
      producer: beat.producer,
      ownerDisplayName: beat.ownerId ? names.get(beat.ownerId) : null,
    });
    if (author === beat.producer) return beat;
    return { ...beat, producer: author };
  });
}

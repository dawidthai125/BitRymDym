import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  studioClipTakeIds,
  studioTakeExpiryNotice,
  type StudioTakeExpiryNotice,
  type StudioTakeExpiryRow,
} from "@/lib/studio/studio-take-expiry";
import type { StudioClipDto } from "@/lib/studio/studio-types";

/**
 * Called after getStudioProjectDocument() checked project ownership.
 * Reads only the owner's own takes; a read error hides the notice (never blocks the page).
 */
export async function loadStudioTakeExpiryNotice(
  ownerId: string,
  clips: readonly StudioClipDto[],
): Promise<StudioTakeExpiryNotice> {
  const ids = [...new Set(studioClipTakeIds(clips))].slice(0, 200);
  if (ids.length === 0) return { kind: "none" };
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("takes")
      .select("id, status, expires_at, deleted_at")
      .eq("owner_id", ownerId)
      .in("id", ids);
    if (error || !data) return { kind: "none" };
    const rows: StudioTakeExpiryRow[] = data.map((r) => ({
      id: String(r.id),
      status: String(r.status ?? ""),
      expiresAt: (r.expires_at as string | null) ?? null,
      deletedAt: (r.deleted_at as string | null) ?? null,
    }));
    return studioTakeExpiryNotice(ids, rows);
  } catch {
    return { kind: "none" };
  }
}

import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { isUuid } from "@/lib/beats/audio-validation";
import { saveOwnBeatConsents } from "@/lib/beats/service";
import type { EngageKind } from "@/lib/catalog/catalog-policy";
import { listOwnerCatalogEntries, updateOwnerCatalogEntry } from "@/lib/catalog/catalog-service";
import { consentsFromRow, type ConsentPatch, type ListingConsents } from "@/lib/community/consents";
import { updateStudioSampleShare } from "@/lib/studio/samples/sample-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** One row of /account/catalog: a beat, a sample or a finished track with its four switches. */
export type MyListing = {
  kind: EngageKind;
  id: string;
  title: string;
  consents: ListingConsents;
  /** Waiting for a moderator (beats and samples). */
  pending: boolean;
  /** Public page; null while nobody but the owner can open it. */
  href: string | null;
};

type FlagRow = {
  id: string;
  title: string;
  status: string;
  allow_ratings: boolean;
  allow_comments: boolean;
  in_rankings: boolean;
};

export async function listMyListings(userId: string): Promise<Record<EngageKind, MyListing[]>> {
  const admin = createSupabaseAdminClient();
  const [beats, samples, works] = await Promise.all([
    admin
      .from("beats")
      .select("id, title, status, visibility, allow_ratings, allow_comments, in_rankings")
      .eq("owner_id", userId)
      .eq("ownership_type", "USER")
      .neq("status", "ARCHIVED")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("studio_samples")
      .select("id, title, status, public_listing, allow_ratings, allow_comments, in_rankings")
      .eq("owner_id", userId)
      .in("status", ["PUBLISHED", "PENDING_REVIEW"])
      .order("created_at", { ascending: false })
      .limit(500),
    listOwnerCatalogEntries(userId),
  ]);
  if (beats.error) throw new Error(beats.error.message);
  if (samples.error) throw new Error(samples.error.message);
  return {
    beat: ((beats.data ?? []) as Array<FlagRow & { visibility: string | null }>).map((row) => {
      const consents = consentsFromRow(row, row.visibility !== "private");
      const live = row.status === "PUBLISHED";
      return { kind: "beat", id: row.id, title: row.title, consents, pending: !live, href: live ? `/beat/${row.id}` : null };
    }),
    sample: ((samples.data ?? []) as Array<FlagRow & { public_listing: boolean }>).map((row) => {
      const consents = consentsFromRow(row, row.public_listing === true);
      const live = row.status === "PUBLISHED";
      return {
        kind: "sample",
        id: row.id,
        title: row.title,
        consents,
        pending: !live,
        href: live && consents.listed ? `/sampel/${row.id}` : null,
      };
    }),
    work: works.map((entry) => ({
      kind: "work",
      id: entry.id,
      title: entry.title,
      consents: {
        listed: entry.listed,
        allowRatings: entry.allowRatings,
        allowComments: entry.allowComments,
        inRankings: entry.inRankings,
      },
      pending: false,
      href: entry.listed ? `/utwor/${entry.id}` : null,
    })),
  };
}

export async function updateMyListing(
  context: AuthContext,
  kind: EngageKind,
  id: string,
  patch: ConsentPatch,
): Promise<{ result: "ok" | "missing" | "invalid" | "off"; consents?: ListingConsents }> {
  if (!isUuid(id) || Object.keys(patch).length === 0) return { result: "invalid" };
  if (kind === "beat") {
    const consents = await saveOwnBeatConsents(context, id, patch);
    return consents ? { result: "ok", consents } : { result: "missing" };
  }
  if (kind === "sample") {
    const saved = await updateStudioSampleShare(context, id, patch);
    if (saved.ok && saved.sample.consents) return { result: "ok", consents: saved.sample.consents };
    if (!saved.ok && saved.error === "SAMPLE_TABLE_UNAVAILABLE") return { result: "off" };
    if (!saved.ok && (saved.error === "SAMPLE_NOT_FOUND" || saved.error === "SAMPLE_FORBIDDEN")) return { result: "missing" };
    return { result: "invalid" };
  }
  return updateOwnerCatalogEntry(context.userId, id, patch);
}

import "server-only";

/**
 * Public creator profile, server side (service_role). public.public_profiles has no policy for
 * anon / authenticated: every read and write goes through here, after the caller checked the session.
 * The profile row is read on every view (one indexed row), so a switch works at once; the lists behind
 * it are cached for a minute. The time is a part of the cache key: unstable_cache alone serves an entry
 * of any age once and refreshes it afterwards, so a removed item could show days later.
 */
import { randomBytes } from "node:crypto";

import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";

import { mapPublicBeatRow, BEAT_SELECT_PUBLIC, type BeatRow } from "@/lib/beats/types";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { readWorkPlaces } from "@/lib/catalog/catalog-service";
import { loadWorkClips } from "@/lib/catalog/work-clip-server";
import { listOwnerPublicSamples, readBoardPlaces, type PublicSampleCard } from "@/lib/community/community-service";
import { deriveCreatorRank } from "@/lib/creator-progress/rank";
import { forgetCreatorHref } from "@/lib/creators/creator-hrefs";
import { parseCreatorLinks, type CreatorLinkError, type CreatorLinks, type CreatorService } from "@/lib/creators/creator-links";
import { creatorPath, publicIdFromBytes, publicIdFromSlug } from "@/lib/creators/creator-slug";
import {
  filterFacts,
  isProfileLive,
  NO_FACTS,
  parseShareFlags,
  PROFILE_COLUMNS,
  settingsColumns,
  settingsFromRow,
  type ShareKey,
  type CreatorFacts,
  type CreatorPlace,
  type CreatorWorkCard,
  type ProfileRow,
  type ProfileSettings,
  type ShareFlags,
} from "@/lib/creators/profile-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { presentBeats, type PresentedBeat } from "@/lib/ui/demo-beats";
import type { CreatorRank } from "@/types/creator-progress";

const TABLE = "public_profiles";
/** Rows of each list on the profile page. */
const LIST_MAX = 20;
const FACTS_SECONDS = 60;
const PLACES_SECONDS = 120;
const SITEMAP_MAX = 300;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const PLACES_TAG = "creator-ranking-places";
/** Changes every `seconds`; a part of a cache key, so nothing older is served. */
const timeBucket = (seconds: number) => Math.floor(Date.now() / (seconds * 1000));
/** PostgREST: the table is not there (a database without the migration). */
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);

const factsTag = (ownerId: string) => `creator-facts-${ownerId}`;

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/** Fresh lists on the next view (the creator changed the profile or what is in the catalogue). */
export function revalidateCreatorFacts(ownerId: string): void {
  forgetCreatorHref(ownerId);
  try {
    revalidateTag(factsTag(ownerId), { expire: 0 });
    revalidateTag(PLACES_TAG, { expire: 0 });
  } catch {
    // Outside a request: the minute-long cache runs out by itself.
  }
}

// ---------------------------------------------------------------- owner settings

export type OwnProfile =
  | { state: "off" }
  | { state: "ok"; displayName: string | null; settings: ProfileSettings | null; path: string | null };

async function loadDisplayName(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data as { display_name?: string | null } | null)?.display_name?.trim() || null;
}

export async function loadOwnProfile(userId: string): Promise<OwnProfile> {
  const admin = adminOrNull();
  if (!admin) return { state: "off" };
  try {
    const [loaded, displayName] = await Promise.all([
      admin.from(TABLE).select(PROFILE_COLUMNS).eq("owner_id", userId).maybeSingle(),
      loadDisplayName(admin, userId),
    ]);
    if (loaded.error) return { state: "off" };
    const settings = loaded.data ? settingsFromRow(loaded.data as unknown as ProfileRow) : null;
    return { state: "ok", displayName, settings, path: creatorPath(settings?.publicId, displayName) };
  } catch {
    return { state: "off" };
  }
}

export type SaveProfileResult =
  | { ok: true; path: string | null; links: CreatorLinks; enabled: boolean; blocked: boolean }
  | { ok: false; code: "LINKS"; errors: Partial<Record<CreatorService, CreatorLinkError>> }
  | { ok: false; code: "NO_NAME" | "OFF" };

/** All settings at once. Nothing is saved while any link is wrong. The caller checked the session. */
export async function saveOwnProfile(userId: string, input: unknown): Promise<SaveProfileResult> {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const parsed = parseCreatorLinks(raw.links);
  if (!parsed.ok) return { ok: false, code: "LINKS", errors: parsed.errors };
  const admin = adminOrNull();
  if (!admin) return { ok: false, code: "OFF" };
  try {
    const displayName = await loadDisplayName(admin, userId);
    const enabled = raw.enabled === true;
    if (enabled && !displayName) return { ok: false, code: "NO_NAME" };
    const columns = {
      ...settingsColumns({ enabled, links: parsed.links, share: parseShareFlags(raw.share) }),
      updated_at: new Date().toISOString(),
    };
    const row = await writeRow(admin, userId, columns);
    if (!row) return { ok: false, code: "OFF" };
    revalidateCreatorFacts(userId);
    const settings = settingsFromRow(row);
    return {
      ok: true,
      path: creatorPath(settings.publicId, displayName),
      links: settings.links,
      enabled: settings.enabled,
      blocked: settings.blocked,
    };
  } catch (error) {
    console.error("[creator-profile] save failed:", error instanceof Error ? error.message : error);
    return { ok: false, code: "OFF" };
  }
}

/** Update, or insert with a fresh public id (again when the id is taken or two tabs save at once). */
async function writeRow(admin: Admin, userId: string, columns: Record<string, unknown>): Promise<ProfileRow | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const updated = await admin.from(TABLE).update(columns).eq("owner_id", userId).select(PROFILE_COLUMNS).maybeSingle();
    if (updated.error) return null;
    if (updated.data) return updated.data as unknown as ProfileRow;
    const inserted = await admin
      .from(TABLE)
      .insert({ ...columns, owner_id: userId, public_id: publicIdFromBytes(randomBytes(10)) })
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (inserted.data) return inserted.data as unknown as ProfileRow;
    if (inserted.error?.code !== "23505") return null;
  }
  return null;
}

// ---------------------------------------------------------------- public page

export type CreatorView = {
  /** Server only: compare with the viewer, never render. */
  ownerId: string;
  path: string;
  name: string;
  live: boolean;
  blocked: boolean;
  links: CreatorLinks;
  experience: { rank: CreatorRank; total: number } | null;
  /** First day of the month the account was made (no exact date). */
  joinedMonth: string | null;
  share: ShareFlags;
};

type OwnerRow = { display_name?: string | null; experience_total?: number | null; created_at?: string | null; role?: string | null };

/** Stored row + account → what may be shown. Pure; exported for tests. */
export function creatorView(row: ProfileRow, owner: OwnerRow): CreatorView | null {
  const settings = settingsFromRow(row);
  const name = owner.display_name?.trim() ?? "";
  const path = creatorPath(settings.publicId, name);
  if (!path) return null;
  const total = Math.max(0, Math.floor(Number(owner.experience_total ?? 0)) || 0);
  const joined = settings.share.joined && owner.created_at ? new Date(owner.created_at) : null;
  return {
    ownerId: String(row.owner_id),
    path,
    name,
    live: isProfileLive(settings),
    blocked: settings.blocked,
    links: settings.share.links ? settings.links : {},
    experience: settings.share.experience ? { rank: deriveCreatorRank(total), total } : null,
    joinedMonth: joined && !Number.isNaN(joined.getTime()) ? `${joined.toISOString().slice(0, 7)}-01` : null,
    // Samples of an administrator are the BitRymDym pack, not that person's.
    share: owner.role === "ADMIN" ? { ...settings.share, samples: false } : settings.share,
  };
}

/**
 * One profile per request (metadata + page). Also returns a profile that is off: the page decides.
 * Null only when there is no such profile: a database error throws, so it is never served as a 404.
 */
export const findCreator = cache(async function findCreator(slug: string): Promise<CreatorView | null> {
  const publicId = publicIdFromSlug(slug);
  const admin = publicId ? adminOrNull() : null;
  if (!publicId || !admin) return null;
  const loaded = await admin
    .from(TABLE)
    .select(`${PROFILE_COLUMNS}, profiles!inner(display_name, experience_total, created_at, role)`)
    .eq("public_id", publicId)
    .maybeSingle();
  if (loaded.error) {
    if (TABLE_MISSING.has(loaded.error.code)) return null;
    throw new Error(`[creator-profile] ${loaded.error.message}`);
  }
  if (!loaded.data) return null;
  const row = loaded.data as unknown as ProfileRow & { profiles: OwnerRow | OwnerRow[] };
  const owner = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return owner ? creatorView(row, owner) : null;
});

export type PublicCreatorFacts = CreatorFacts<PresentedBeat, PublicSampleCard>;

async function soft<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    console.error("[creator-profile] part failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function must<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}

async function loadBeats(admin: Admin, ownerId: string) {
  const loaded = must(
    await admin
      .from("beats")
      .select(BEAT_SELECT_PUBLIC, { count: "exact" })
      .eq("owner_id", ownerId)
      .eq("ownership_type", "USER")
      .eq("status", "PUBLISHED")
      .eq("visibility", "public")
      .or("catalog_lane.is.null,catalog_lane.neq.paid")
      .is("sold_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_MAX),
  );
  const items = presentBeats(((loaded.data as BeatRow[] | null) ?? []).map(mapPublicBeatRow).map(toPublicCatalogItem));
  return { total: loaded.count ?? items.length, items };
}

async function loadSamples(ownerId: string) {
  const { total, samples } = await listOwnerPublicSamples(ownerId, LIST_MAX);
  return { total, items: samples };
}

async function loadWorks(admin: Admin, ownerId: string): Promise<{ total: number; items: CreatorWorkCard[] }> {
  const loaded = must(
    await admin
      .from("catalog_works")
      .select("id, title", { count: "exact" })
      .eq("owner_id", ownerId)
      .is("withdrawn_at", null)
      .order("published_at", { ascending: false })
      .limit(LIST_MAX),
  );
  const rows = (loaded.data ?? []) as { id: string; title: string }[];
  const clips = await loadWorkClips(rows.map((row) => row.id));
  return {
    total: loaded.count ?? rows.length,
    items: rows.map((row) => {
      const clip = clips.get(row.id);
      return { id: row.id, title: row.title, clipSeconds: clip?.state === "ready" ? clip.seconds : null };
    }),
  };
}

async function countWorks(admin: Admin, ownerId: string): Promise<number> {
  const counted = must(
    await admin.from("catalog_works").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).is("withdrawn_at", null),
  );
  return counted.count ?? 0;
}

/** Finished songs: Studio projects with an approved master (same rule as "Moje utwory" on /account). A number only. */
async function countFinishedSongs(admin: Admin, ownerId: string): Promise<number> {
  const loaded = must(
    await admin
      .from("studio_master_jobs")
      .select("project_id, studio_projects!inner(status)")
      .neq("studio_projects.status", "ARCHIVED")
      .eq("owner_id", ownerId)
      .eq("kind", "master")
      .eq("status", "succeeded")
      .not("approved_at", "is", null)
      .limit(1000),
  );
  return new Set(((loaded.data ?? []) as { project_id: string }[]).map((row) => row.project_id)).size;
}

/** Places on every board, computed once for the whole site (not per profile). The argument is the time bucket. */
const loadAllPlaces = unstable_cache(
  async (bucket: number): Promise<Array<CreatorPlace & { ownerId: string }>> => {
    void bucket;
    const boards = await Promise.all([
      readWorkPlaces("week").then((rows) => rows.map((row) => ({ ...row, kind: "work" as const, period: "week" as const }))),
      readWorkPlaces("month").then((rows) => rows.map((row) => ({ ...row, kind: "work" as const, period: "month" as const }))),
      readWorkPlaces("all").then((rows) => rows.map((row) => ({ ...row, kind: "work" as const, period: "all" as const }))),
      readBoardPlaces("beat", "week").then((rows) => rows.map((row) => ({ ...row, kind: "beat" as const, period: "week" as const }))),
      readBoardPlaces("beat", "month").then((rows) => rows.map((row) => ({ ...row, kind: "beat" as const, period: "month" as const }))),
      readBoardPlaces("sample", "week").then((rows) => rows.map((row) => ({ ...row, kind: "sample" as const, period: "week" as const }))),
      readBoardPlaces("sample", "month").then((rows) => rows.map((row) => ({ ...row, kind: "sample" as const, period: "month" as const }))),
    ]);
    return boards.flat();
  },
  [PLACES_TAG],
  { revalidate: PLACES_SECONDS, tags: [PLACES_TAG] },
);

async function loadPlaces(ownerId: string): Promise<CreatorPlace[]> {
  return (await loadAllPlaces(timeBucket(PLACES_SECONDS)))
    .filter((row) => row.ownerId === ownerId)
    .sort((a, b) => a.place - b.place)
    .slice(0, LIST_MAX)
    .map(({ kind, period, place, targetId, title }) => ({ kind, period, place, targetId, title }));
}

/** Once per request. Only what is switched on is read, and `filterFacts` drops anything else before it is returned. */
export const loadCreatorFacts = cache(async function loadCreatorFacts(view: CreatorView): Promise<PublicCreatorFacts> {
  const { ownerId, share } = view;
  const bucket = String(timeBucket(FACTS_SECONDS));
  // Each part is cached on its own and throws inside the cache, so a failed read is never stored as "nothing".
  const part = <T>(key: ShareKey, read: () => Promise<T>): Promise<T | null> | null =>
    share[key]
      ? soft(unstable_cache(read, ["creator-facts", ownerId, key, bucket], { revalidate: FACTS_SECONDS, tags: [factsTag(ownerId)] })())
      : null;
  try {
    const [trackCount, recordingCount, beats, samples, works, places] = await Promise.all([
      part("trackCount", () => countWorks(createSupabaseAdminClient(), ownerId)),
      part("recordingCount", () => countFinishedSongs(createSupabaseAdminClient(), ownerId)),
      part("beats", () => loadBeats(createSupabaseAdminClient(), ownerId)),
      part("samples", () => loadSamples(ownerId)),
      part("works", () => loadWorks(createSupabaseAdminClient(), ownerId)),
      share.rankings ? soft(loadPlaces(ownerId)) : null,
    ]);
    const named: PublicCreatorFacts = {
      trackCount,
      recordingCount,
      beats: beats && { ...beats, items: beats.items.map((beat) => ({ ...beat, producer: view.name })) },
      samples: samples && { ...samples, items: samples.items.map((sample) => ({ ...sample, author: view.name })) },
      works,
      places,
    };
    return filterFacts(named, share);
  } catch (error) {
    console.error("[creator-profile] facts failed:", error instanceof Error ? error.message : error);
    return NO_FACTS;
  }
});

// ---------------------------------------------------------------- sitemap, admin

/** Profiles that are on and share at least one public item (newest change first, capped). */
export async function listCreatorSitemapEntries(): Promise<Array<{ path: string; updatedAt: string }>> {
  const admin = adminOrNull();
  if (!admin) return [];
  const { data, error } = await admin.rpc("public_profile_sitemap", { p_limit: SITEMAP_MAX });
  if (error) return [];
  return ((data ?? []) as { public_id: string; display_name: string | null; updated_at: string }[]).flatMap((row) => {
    const path = creatorPath(row.public_id, row.display_name);
    return path ? [{ path, updatedAt: row.updated_at }] : [];
  });
}

export type AdminCreatorProfile = { path: string | null; enabled: boolean; blocked: boolean };

/** For the admin user card. Null: no profile saved, or the table is not there yet. The caller checked the role. */
export async function loadAdminCreatorProfile(userId: string): Promise<AdminCreatorProfile | null> {
  const own = await loadOwnProfile(userId);
  if (own.state !== "ok" || !own.settings) return null;
  return { path: own.path, enabled: own.settings.enabled, blocked: own.settings.blocked };
}

/** Admin off switch. Returns the earlier value for the audit, or null when nothing was saved. */
export async function setCreatorProfileBlocked(userId: string, blocked: boolean): Promise<{ before: boolean } | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const existing = await admin.from(TABLE).select("blocked").eq("owner_id", userId).maybeSingle();
  if (existing.error || !existing.data) return null;
  const saved = await admin.from(TABLE).update({ blocked }).eq("owner_id", userId);
  if (saved.error) return null;
  revalidateCreatorFacts(userId);
  return { before: (existing.data as { blocked?: boolean }).blocked === true };
}

import "server-only";

import { cache } from "react";

import { isUuid } from "@/lib/beats/audio-validation";
import { loadPublicAuthorDisplayNames } from "@/lib/beats/public-author";
import {
  cleanWorkTitle,
  normalizeWorkConsents,
  warsawHalfYear,
  workWindow,
  type WorkBoardPeriod,
  type WorkConsents,
} from "@/lib/catalog/catalog-policy";
import {
  applyConsentPatch,
  consentsFromRow,
  type ConsentPatch,
  type ListingConsents,
} from "@/lib/community/consents";
import { WORK_ALL_PLACES } from "@/lib/catalog/catalog-prize";
import { aggregateRatings, MIN_RATERS, previousPeriod, rankTargets, warsawPeriod } from "@/lib/community/ranking-policy";
import { publicAuthorName } from "@/lib/community/share-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueWorkClip } from "@/lib/catalog/work-clip-server";

const TABLE = "catalog_works";
const RATINGS = "community_ratings";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type DbError = { message?: string; code?: string } | null;

export type CatalogCard = {
  id: string;
  title: string;
  ownerId: string;
  author: string;
  allowRatings: boolean;
  allowComments: boolean;
  inRankings: boolean;
  publishedAt: string;
};

export type OwnerCatalogEntry = CatalogCard & {
  projectId: string;
  masterJobId: string;
  listed: boolean;
};

export type WorkBoardRow = {
  place: number;
  targetId: string;
  title: string;
  author: string;
  score: number;
  count: number;
};

export type WorkBoard = {
  enabled: boolean;
  periodKey: string;
  closed: boolean;
  rows: WorkBoardRow[];
  lead: { targetId: string; title: string; author: string } | null;
};

type Row = {
  id: string;
  owner_id: string;
  project_id: string;
  master_job_id: string;
  title: string;
  allow_ratings: boolean;
  allow_comments: boolean;
  in_rankings: boolean;
  published_at: string;
  withdrawn_at: string | null;
};

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

function missingRelation(error: DbError, table: string): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes(table) ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

async function authorNames(ownerIds: string[]): Promise<Map<string, string | null>> {
  try {
    return await loadPublicAuthorDisplayNames(ownerIds);
  } catch {
    return new Map();
  }
}

function toCard(row: Row, names: Map<string, string | null>): CatalogCard {
  return {
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    author: publicAuthorName({ ownership: "USER", displayName: names.get(row.owner_id) }),
    allowRatings: row.allow_ratings,
    allowComments: row.allow_comments,
    inRankings: row.in_rankings,
    publishedAt: row.published_at,
  };
}

async function cardsOf(rows: Row[]): Promise<CatalogCard[]> {
  const names = await authorNames(rows.map((row) => row.owner_id));
  return rows.map((row) => toCard(row, names));
}

const PUBLIC_WORKS_PAGE = 100;
const SITEMAP_WORKS_MAX = 5000;

function pageWindow(limit: number | undefined, offset: number | undefined, fallback: number) {
  const size = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : fallback;
  const from = Number.isFinite(offset) && (offset as number) > 0 ? Math.floor(offset as number) : 0;
  return { from, to: from + size - 1 };
}

/** Newest-first public works. Defaults to the first 100 (`limit`/`offset` page it). */
export async function listPublicWorks(
  options: { limit?: number; offset?: number } = {},
): Promise<{ enabled: boolean; works: CatalogCard[] }> {
  const admin = adminOrNull();
  if (!admin) return { enabled: false, works: [] };
  const { from, to } = pageWindow(options.limit, options.offset, PUBLIC_WORKS_PAGE);
  const loaded = await admin
    .from(TABLE)
    .select("id, owner_id, project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, published_at, withdrawn_at")
    .is("withdrawn_at", null)
    .order("published_at", { ascending: false })
    .range(from, to);
  if (missingRelation(loaded.error, TABLE)) return { enabled: false, works: [] };
  if (loaded.error) return { enabled: true, works: [] };
  return { enabled: true, works: await cardsOf((loaded.data ?? []) as Row[]) };
}

/**
 * Sitemap feed: id + publish date of live works only (no author lookup),
 * newest first, up to 5000 — same visibility gate as {@link listPublicWorks}.
 */
export async function listPublicWorkSitemapEntries(): Promise<
  Array<{ id: string; publishedAt: string }>
> {
  const admin = adminOrNull();
  if (!admin) return [];
  const loaded = await admin
    .from(TABLE)
    .select("id, published_at")
    .is("withdrawn_at", null)
    .order("published_at", { ascending: false })
    .range(0, SITEMAP_WORKS_MAX - 1);
  if (loaded.error) return [];
  return ((loaded.data ?? []) as Array<{ id: string; published_at: string }>).map((row) => ({
    id: row.id,
    publishedAt: row.published_at,
  }));
}

/**
 * Request-deduped (React `cache`): `/utwor/[id]` reads it in metadata, page,
 * the community thread and the OG image; one round trip per request.
 */
export const findLiveCatalogWork = cache(async function findLiveCatalogWork(
  id: string,
): Promise<CatalogCard | null> {
  if (!isUuid(id)) return null;
  const admin = adminOrNull();
  if (!admin) return null;
  const loaded = await admin
    .from(TABLE)
    .select("id, owner_id, project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, published_at, withdrawn_at")
    .eq("id", id)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (loaded.error || !loaded.data) return null;
  const [card] = await cardsOf([loaded.data as Row]);
  return card ?? null;
});

export async function loadOwnerCatalogEntry(
  userId: string,
  projectId: string,
  masterJobId: string,
): Promise<{ enabled: boolean; entry: OwnerCatalogEntry | null; older: { id: string; title: string } | null }> {
  if (!isUuid(projectId) || !isUuid(masterJobId)) return { enabled: true, entry: null, older: null };
  const admin = adminOrNull();
  if (!admin) return { enabled: false, entry: null, older: null };
  const loaded = await admin
    .from(TABLE)
    .select("id, owner_id, project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, published_at, withdrawn_at")
    .eq("master_job_id", masterJobId)
    .eq("owner_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (missingRelation(loaded.error, TABLE)) return { enabled: false, entry: null, older: null };
  // A failed read must not look like "not published": saving that would take the track out of the catalogue.
  if (loaded.error) throw new Error(loaded.error.message ?? "catalog_works read failed");
  // An earlier master of the same project that is still public.
  const before = await admin
    .from(TABLE)
    .select("id, title")
    .eq("owner_id", userId)
    .eq("project_id", projectId)
    .neq("master_job_id", masterJobId)
    .is("withdrawn_at", null)
    .limit(1)
    .maybeSingle();
  if (before.error) throw new Error(before.error.message ?? "catalog_works read failed");
  const older = before.data ? { id: String(before.data.id), title: String(before.data.title) } : null;
  if (!loaded.data) return { enabled: true, entry: null, older };
  const row = loaded.data as Row;
  const [card] = await cardsOf([row]);
  if (!card) throw new Error("catalog_works card read failed");
  return {
    enabled: true,
    older,
    entry: {
      ...card,
      projectId: row.project_id,
      masterJobId: row.master_job_id,
      listed: row.withdrawn_at == null,
    },
  };
}

async function approvedMaster(admin: Admin, userId: string, projectId: string, masterJobId: string): Promise<boolean> {
  const loaded = await admin
    .from("studio_master_jobs")
    .select("id, project_id, owner_id, kind, status, approved_at")
    .eq("id", masterJobId)
    .maybeSingle();
  if (loaded.error || !loaded.data) return false;
  const job = loaded.data as {
    project_id: string;
    owner_id: string;
    kind: string;
    status: string;
    approved_at: string | null;
  };
  return (
    job.owner_id === userId &&
    job.project_id === projectId &&
    job.kind === "master" &&
    job.status === "succeeded" &&
    job.approved_at != null
  );
}

export async function saveOwnerCatalog(input: {
  userId: string;
  projectId: string;
  masterJobId: string;
  title: unknown;
  publish: boolean;
  /** Publishing a new master: take the project's earlier public version down (its ratings stay with it). */
  withdrawOlder?: boolean;
  consents: WorkConsents;
}): Promise<"ok" | "invalid" | "missing" | "off"> {
  if (!isUuid(input.projectId) || !isUuid(input.masterJobId) || typeof input.publish !== "boolean") return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  // Withdrawing needs no master: the owner can always take the track out.
  if (input.publish && !(await approvedMaster(admin, input.userId, input.projectId, input.masterJobId))) return "missing";
  const existing = await admin
    .from(TABLE)
    .select("id")
    .eq("master_job_id", input.masterJobId)
    .maybeSingle();
  if (missingRelation(existing.error, TABLE)) return "off";
  if (existing.error) return "invalid";
  const consents = normalizeWorkConsents(input.consents);

  if (!input.publish) {
    if (!existing.data) return "ok";
    const withdrawn = await admin
      .from(TABLE)
      .update({ withdrawn_at: new Date().toISOString(), in_rankings: false })
      .eq("id", (existing.data as { id: string }).id)
      .eq("owner_id", input.userId);
    if (missingRelation(withdrawn.error, TABLE)) return "off";
    if (withdrawn.error) return "invalid";
    return "ok";
  }

  const title = cleanWorkTitle(input.title);
  if (!title) return "invalid";
  const patch = {
    owner_id: input.userId,
    project_id: input.projectId,
    master_job_id: input.masterJobId,
    title,
    allow_ratings: consents.allowRatings,
    allow_comments: consents.allowComments,
    in_rankings: consents.inRankings,
    withdrawn_at: null,
  };
  const saved = existing.data
    ? await admin.from(TABLE).update(patch).eq("id", (existing.data as { id: string }).id).eq("owner_id", input.userId)
    : await admin.from(TABLE).insert({ ...patch, published_at: new Date().toISOString() });
  if (missingRelation(saved.error, TABLE)) return "off";
  if (saved.error) return "invalid";
  if (input.withdrawOlder === true) {
    const gone = await admin
      .from(TABLE)
      .update({ withdrawn_at: new Date().toISOString(), in_rankings: false })
      .eq("owner_id", input.userId)
      .eq("project_id", input.projectId)
      .neq("master_job_id", input.masterJobId)
      .is("withdrawn_at", null);
    if (gone.error) console.error("[catalog] older version not withdrawn", input.projectId, gone.error.message);
  }
  // Public 45 s clip: queue the E3 cut (best effort; never fails the publish).
  await queueWorkClip(admin, input.userId, input.masterJobId);
  return "ok";
}

/** Every track the owner ever put in the catalogue (also earlier masters), newest first. */
export async function listOwnerCatalogEntries(userId: string): Promise<OwnerCatalogEntry[]> {
  const admin = adminOrNull();
  if (!admin) return [];
  const loaded = await admin
    .from(TABLE)
    .select("id, owner_id, project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, published_at, withdrawn_at")
    .eq("owner_id", userId)
    .order("published_at", { ascending: false })
    .limit(500);
  if (missingRelation(loaded.error, TABLE)) return [];
  if (loaded.error) throw new Error(loaded.error.message ?? "catalog_works read failed");
  return ((loaded.data ?? []) as Row[]).map((row) => ({
    ...toCard(row, new Map()),
    projectId: row.project_id,
    masterJobId: row.master_job_id,
    listed: row.withdrawn_at == null,
  }));
}

/** Owner switches for one track by its id, without opening the Studio. */
export async function updateOwnerCatalogEntry(
  userId: string,
  workId: string,
  patch: ConsentPatch,
): Promise<{ result: "ok" | "invalid" | "missing" | "off"; consents?: ListingConsents }> {
  if (!isUuid(workId)) return { result: "invalid" };
  const admin = adminOrNull();
  if (!admin) return { result: "off" };
  const loaded = await admin
    .from(TABLE)
    .select("project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, withdrawn_at")
    .eq("id", workId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (missingRelation(loaded.error, TABLE)) return { result: "off" };
  if (loaded.error || !loaded.data) return { result: "missing" };
  const row = loaded.data as Pick<Row, "project_id" | "master_job_id" | "title" | "allow_ratings" | "allow_comments" | "in_rankings" | "withdrawn_at">;
  const consents = applyConsentPatch(consentsFromRow(row, row.withdrawn_at == null), patch);
  const result = await saveOwnerCatalog({
    userId,
    projectId: row.project_id,
    masterJobId: row.master_job_id,
    title: row.title,
    publish: consents.listed,
    consents,
  });
  return result === "ok" ? { result, consents } : { result };
}

async function rankingWorks(admin: Admin): Promise<Map<string, CatalogCard> | null> {
  const loaded = await admin
    .from(TABLE)
    .select("id, owner_id, project_id, master_job_id, title, allow_ratings, allow_comments, in_rankings, published_at, withdrawn_at")
    .is("withdrawn_at", null)
    .eq("in_rankings", true)
    .eq("allow_ratings", true)
    .eq("allow_comments", true)
    .limit(500);
  if (missingRelation(loaded.error, TABLE)) return null;
  if (loaded.error) return new Map();
  const cards = await cardsOf((loaded.data ?? []) as Row[]);
  return new Map(cards.map((card) => [card.id, card]));
}

type ScoredWork = WorkBoardRow & { ownerId: string };

async function scoreAll(
  admin: Admin,
  works: Map<string, CatalogCard>,
  start: Date,
  end: Date,
): Promise<ScoredWork[] | null> {
  const loaded = await admin
    .from(RATINGS)
    .select("target_id, user_id, stars, created_at")
    .eq("target_kind", "work")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(5000);
  if (missingRelation(loaded.error, RATINGS)) return null;
  if (loaded.error) return [];
  const ratings = ((loaded.data ?? []) as Array<{ target_id: string; user_id: string; stars: number; created_at: string }>)
    .flatMap((row) => {
      const work = works.get(row.target_id);
      if (!work) return [];
      return [{
        targetId: row.target_id,
        ownerId: work.ownerId,
        userId: row.user_id,
        stars: Number(row.stars),
        at: row.created_at,
      }];
    });
  return rankTargets(aggregateRatings(ratings, start, end)).map((row) => {
    const work = works.get(row.targetId);
    return {
      place: row.place,
      targetId: row.targetId,
      title: work?.title ?? "—",
      author: work?.author ?? "—",
      score: row.score,
      count: row.count,
      ownerId: work?.ownerId ?? "",
    };
  });
}

async function scoreWindow(
  admin: Admin,
  works: Map<string, CatalogCard>,
  start: Date,
  end: Date,
  limit: number,
): Promise<WorkBoardRow[] | null> {
  const scored = await scoreAll(admin, works, start, end);
  if (!scored) return null;
  return scored.slice(0, limit).map(({ ownerId, ...row }) => {
    void ownerId;
    return row;
  });
}

export async function findWorkPrizeWinner(
  start: Date,
  end: Date,
): Promise<{ ownerId: string; workId: string; place: number } | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const works = await rankingWorks(admin);
  if (!works) return null;
  const scored = await scoreAll(admin, works, start, end);
  if (!scored) return null;
  const winner = scored.find((row) => row.ownerId && row.count >= MIN_RATERS);
  if (!winner) return null;
  return { ownerId: winner.ownerId, workId: winner.targetId, place: winner.place };
}

export async function readWorkBoard(period: WorkBoardPeriod, now = new Date()): Promise<WorkBoard> {
  const window = workWindow(now, period);
  const empty: WorkBoard = { enabled: false, periodKey: window.key, closed: window.closed, rows: [], lead: null };
  const admin = adminOrNull();
  if (!admin) return empty;
  const works = await rankingWorks(admin);
  if (!works) return empty;
  const rows = await scoreWindow(admin, works, window.start, window.end, period === "all" ? WORK_ALL_PLACES : 20);
  if (!rows) return empty;
  let lead: WorkBoard["lead"] = null;
  if (period === "week" || period === "month") {
    const current = warsawPeriod(now, period);
    const previous = previousPeriod(current, now);
    const earlier = await scoreWindow(admin, works, previous.start, previous.end, 1);
    const first = earlier?.[0];
    if (first) lead = { targetId: first.targetId, title: first.title, author: first.author };
  }
  return { enabled: true, periodKey: window.key, closed: window.closed, rows, lead };
}

export async function readHalfYearPlaces(now = new Date()): Promise<{ enabled: boolean; year: number; half: 1 | 2; rows: WorkBoardRow[] }> {
  const half = warsawHalfYear(now);
  const admin = adminOrNull();
  if (!admin) return { enabled: false, year: half.year, half: half.half, rows: [] };
  const works = await rankingWorks(admin);
  if (!works) return { enabled: false, year: half.year, half: half.half, rows: [] };
  const rows = await scoreWindow(admin, works, half.start, half.end, 20);
  if (!rows) return { enabled: false, year: half.year, half: half.half, rows: [] };
  return { enabled: true, year: half.year, half: half.half, rows };
}

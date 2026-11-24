import "server-only";

import { cache } from "react";

import { isUuid } from "@/lib/beats/audio-validation";
import { loadPublicAuthorDisplayNames } from "@/lib/beats/public-author";
import { resolvePublicAuthor } from "@/lib/beats/public-author-resolve";
import { getPublishedBeat, listPublishedBeatBoardKeys } from "@/lib/beats/service";
import {
  aggregateRatings,
  cleanComment,
  COMMENT_MAX,
  previousPeriod,
  prizesFor,
  rankTargets,
  rewardGrant,
  warsawPeriod,
  type PeriodKind,
  type PeriodWindow,
  type RatingInput,
  type TargetKind,
} from "@/lib/community/ranking-policy";
import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { creatorHref, loadCreatorIds } from "@/lib/creators/creator-hrefs";
import { claimCommunityReward } from "@/lib/community/reward-apply";
import { canDeleteComment, hideRole } from "@/lib/community/comment-moderation-policy";
import { canCommentPublic, publicAuthorName, type CatalogSource } from "@/lib/community/share-policy";
import { loadPlanSnapshot } from "@/lib/payments/snapshots";
import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SystemRole } from "@/types/domain";

const RATINGS = "community_ratings";
const COMMENTS = "community_comments";
const REWARDS = "community_rewards";

/** Rows on one board. */
const BOARD_ROWS = 20;

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type DbError = { message?: string; code?: string } | null;

export type { CatalogSource };

export type PublicSampleCard = {
  id: string;
  title: string;
  author: string;
  /** Public profile of the author, when it is on. */
  authorHref?: string | null;
  kind: string;
  instrument: string | null;
  durationMs: number;
  /** Sample Lab metadata (null when not set or before the lab columns existed). */
  sampleType: string | null;
  bpm: number | null;
  musicalKey: string | null;
  bars: number | null;
  /** Own catalogue text (PL / EN); null → copy built from facts. */
  description: string | null;
  descriptionEn: string | null;
  /** Published by BitRymDym (an admin account), not by a user. */
  platform: boolean;
  /** ISO time the sample was created (fallback numbering before `sampleNumber` existed). */
  createdAt: string | null;
  /** Stable catalog number (`studio_samples.sample_number`); null before that migration. */
  sampleNumber: number | null;
  /** Average stars (1 decimal) and number of ratings, all time. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Same over the last 7 days (for "Sampel tygodnia"). */
  weekAvg: number | null;
  weekCount: number;
  /** Author's choice: "Sampel tygodnia" and the ranking use only these. */
  inRankings: boolean;
};

export type BoardRow = {
  place: number;
  targetId: string;
  title: string;
  author: string;
  authorHref?: string | null;
  score: number;
  count: number;
  prize: { place: number; tier: string; days: number; mode: string } | null;
  /** True for a user's work (catalog tab "Użytkownicy"). */
  userOwned: boolean;
};

export type Board = {
  enabled: boolean;
  periodKey: string;
  closed: boolean;
  rows: BoardRow[];
  champion: { targetId: string; title: string; author: string; authorHref?: string | null; userOwned: boolean } | null;
};

export type ThreadComment = {
  id: string;
  author: string;
  authorHref?: string | null;
  body: string;
  createdAt: string;
  /** The viewer wrote it, so they may delete it. */
  mine: boolean;
  /** The viewer owns the work or is staff, so they may hide it. */
  canHide: boolean;
};

export type Thread = {
  enabled: boolean;
  found: boolean;
  own: boolean;
  /** False when the author left comments off. */
  commentsOpen: boolean;
  /** False when the author left ratings off (beat, sample or finished track). */
  ratingsOpen: boolean;
  average: number | null;
  count: number;
  mine: number | null;
  comments: ThreadComment[];
};

export type RewardView = {
  id: string;
  periodKind: PeriodKind;
  periodKey: string;
  place: number;
  targetKind: TargetKind;
  title: string;
  mode: string;
  tier: string;
  days: number;
  status: string;
};

type Work = {
  id: string;
  title: string;
  ownerId: string | null;
  author: string;
  authorHref?: string | null;
  ownership: "PLATFORM" | "USER";
  allowComments: boolean;
  allowRatings?: boolean;
  inRankings?: boolean;
  kind?: string;
  instrument?: string | null;
  durationMs?: number;
};

function shareColumnMissing(error: DbError, column: string): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes(column) &&
    (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"))
  );
}

function missingCommunity(error: DbError): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("community_ratings") ||
    message.includes("community_comments") ||
    message.includes("community_rewards") ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/** Adds the link only when there is one, so the payload of names without a profile stays as it was. */
function hrefField(href: string | null | undefined): { authorHref?: string } {
  return href ? { authorHref: href } : {};
}

/** Samples published by an admin are the official BitRymDym pack (catalog tab "BitRymDym"). */
async function platformSampleOwners(ownerIds: string[]): Promise<Set<string>> {
  const admin = adminOrNull();
  const ids = [...new Set(ownerIds)];
  if (!admin || ids.length === 0) return new Set();
  const { data, error } = await admin.from("profiles").select("id, role").in("id", ids).eq("role", "ADMIN");
  if (error) return new Set();
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}

async function authorNames(ownerIds: string[]): Promise<Map<string, string | null>> {
  try {
    return await loadPublicAuthorDisplayNames(ownerIds);
  } catch {
    return new Map();
  }
}

type BeatFlags = { allowRatings: boolean; allowComments: boolean };

/** Author switches of one beat. A read error keeps both closed. */
async function beatConsentFlags(id: string): Promise<BeatFlags> {
  const closed: BeatFlags = { allowRatings: false, allowComments: false };
  const admin = adminOrNull();
  if (!admin) return closed;
  const loaded = await admin.from("beats").select("id, allow_ratings, allow_comments").eq("id", id).maybeSingle();
  if (loaded.error || !loaded.data) return closed;
  const row = loaded.data as { allow_ratings?: boolean; allow_comments?: boolean };
  return { allowRatings: row.allow_ratings === true, allowComments: row.allow_comments === true };
}

type SampleRow = {
  id: string;
  owner_id: string;
  title: string;
  kind: string;
  instrument: string | null;
  duration_ms: number;
  public_listing?: boolean;
  allow_ratings?: boolean;
  allow_comments?: boolean;
  in_rankings?: boolean;
};

const SAMPLE_COLUMNS =
  "id, owner_id, title, kind, instrument, duration_ms, public_listing, allow_ratings, allow_comments, in_rankings";

async function loadPublishedSampleRows(id?: string): Promise<SampleRow[]> {
  const admin = adminOrNull();
  if (!admin) return [];
  let query = admin.from("studio_samples").select(SAMPLE_COLUMNS).eq("status", "PUBLISHED").eq("public_listing", true);
  if (id) query = query.eq("id", id);
  const loaded = await query
    .order("created_at", { ascending: false })
    .limit(200);
  if (loaded.error) return [];
  return (loaded.data ?? []) as SampleRow[];
}

async function publishedSamples(id?: string): Promise<Work[]> {
  const rows = await loadPublishedSampleRows(id);
  const owners = rows.map((row) => row.owner_id);
  const [names, platform, creators] = await Promise.all([authorNames(owners), platformSampleOwners(owners), loadCreatorIds(owners)]);
  return rows.map((row) => {
    const house = platform.has(row.owner_id);
    return {
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      ownership: house ? ("PLATFORM" as const) : ("USER" as const),
      allowComments: row.allow_comments === true,
      allowRatings: row.allow_ratings === true,
      inRankings: row.in_rankings === true,
      author: house
        ? publicAuthorName({ ownership: "PLATFORM" })
        : publicAuthorName({ ownership: "USER", displayName: names.get(row.owner_id) }),
      authorHref: house ? null : creatorHref(creators, row.owner_id, names.get(row.owner_id)),
      kind: row.kind,
      instrument: row.instrument,
      durationMs: Number(row.duration_ms),
    };
  });
}

export async function listPublicSamples(source: CatalogSource): Promise<PublicSampleCard[]> {
  const works = (await publishedSamples()).filter((work) =>
    source === "brd" ? work.ownership === "PLATFORM" : work.ownership === "USER",
  );
  return sampleCards(works);
}

/**
 * One creator's samples in the public catalogue, newest first (public profile). Not for admin
 * accounts: their samples are the BitRymDym pack. No request data is read, so it can be cached.
 * Throws when the read fails: "none" must not be cached by mistake.
 */
export async function listOwnerPublicSamples(
  ownerId: string,
  limit: number,
): Promise<{ total: number; samples: PublicSampleCard[] }> {
  const admin = adminOrNull();
  if (!admin) throw new Error("samples: no database access");
  const loaded = await admin
    .from("studio_samples")
    .select(SAMPLE_COLUMNS, { count: "exact" })
    .eq("status", "PUBLISHED")
    .eq("public_listing", true)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (loaded.error) throw new Error(loaded.error.message);
  const rows = (loaded.data ?? []) as SampleRow[];
  const works: Work[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    ownership: "USER" as const,
    allowComments: row.allow_comments === true,
    allowRatings: row.allow_ratings === true,
    inRankings: row.in_rankings === true,
    author: "",
    kind: row.kind,
    instrument: row.instrument,
    durationMs: Number(row.duration_ms),
  }));
  return { total: loaded.count ?? rows.length, samples: await sampleCards(works) };
}

async function sampleCards(works: readonly Work[]): Promise<PublicSampleCard[]> {
  const ids = works.map((work) => work.id);
  const [meta, stats] = await Promise.all([sampleLabMeta(ids), sampleRatingStats(ids)]);
  return works.map((work) => ({
    id: work.id,
    title: work.title,
    author: work.author,
    ...hrefField(work.authorHref),
    kind: work.kind === "effect" ? "effect" : "instrument",
    instrument: work.instrument ?? null,
    durationMs: work.durationMs ?? 0,
    sampleType: meta.get(work.id)?.sampleType ?? null,
    bpm: meta.get(work.id)?.bpm ?? null,
    musicalKey: meta.get(work.id)?.musicalKey ?? null,
    bars: meta.get(work.id)?.bars ?? null,
    description: meta.get(work.id)?.description ?? null,
    descriptionEn: meta.get(work.id)?.descriptionEn ?? null,
    platform: work.ownership === "PLATFORM",
    createdAt: meta.get(work.id)?.createdAt ?? null,
    sampleNumber: meta.get(work.id)?.sampleNumber ?? null,
    // Ratings off → earlier votes are not shown either.
    ratingAvg: work.allowRatings ? (stats.get(work.id)?.avg ?? null) : null,
    ratingCount: work.allowRatings ? (stats.get(work.id)?.count ?? 0) : 0,
    weekAvg: work.allowRatings ? (stats.get(work.id)?.weekAvg ?? null) : null,
    weekCount: work.allowRatings ? (stats.get(work.id)?.weekCount ?? 0) : 0,
    inRankings: work.inRankings === true,
  }));
}

/** One public sample with its tab siblings (numbers and "similar" need the whole list). */
export async function findPublicSample(
  id: string,
): Promise<{ sample: PublicSampleCard; siblings: PublicSampleCard[] } | null> {
  if (!isUuid(id)) return null;
  for (const source of ["brd", "user"] as const) {
    const siblings = await listPublicSamples(source);
    const sample = siblings.find((s) => s.id === id);
    if (sample) return { sample, siblings };
  }
  // Older than the newest 200 of the list: still a public sample with its own page.
  const [older] = await sampleCards(await publishedSamples(id));
  return older ? { sample: older, siblings: [older] } : null;
}

export type SampleRatingStats = { avg: number | null; count: number; weekAvg: number | null; weekCount: number };

/** Pure: per-sample average and count, all time and over the 7 days before `now`. */
export function summarizeSampleRatings(
  rows: readonly { target_id: string; stars: number; created_at: string }[],
  now: Date = new Date(),
): Map<string, SampleRatingStats> {
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const acc = new Map<string, { sum: number; n: number; wsum: number; wn: number }>();
  for (const row of rows) {
    const stars = Number(row.stars);
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) continue;
    const a = acc.get(row.target_id) ?? { sum: 0, n: 0, wsum: 0, wn: 0 };
    a.sum += stars;
    a.n += 1;
    if (Date.parse(row.created_at) >= weekStart) {
      a.wsum += stars;
      a.wn += 1;
    }
    acc.set(row.target_id, a);
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  const out = new Map<string, SampleRatingStats>();
  for (const [id, a] of acc) {
    out.set(id, {
      avg: a.n ? round(a.sum / a.n) : null,
      count: a.n,
      weekAvg: a.wn ? round(a.wsum / a.wn) : null,
      weekCount: a.wn,
    });
  }
  return out;
}

async function sampleRatingStats(ids: string[]): Promise<Map<string, SampleRatingStats>> {
  const admin = adminOrNull();
  if (!admin || ids.length === 0) return new Map();
  const loaded = await admin
    .from(RATINGS)
    .select("target_id, stars, created_at")
    .eq("target_kind", "sample")
    .in("target_id", ids)
    .limit(5000);
  if (loaded.error) return new Map();
  return summarizeSampleRatings((loaded.data ?? []) as { target_id: string; stars: number; created_at: string }[]);
}

/**
 * "Sampel tygodnia": best 7-day average with at least 2 ratings that week; otherwise the most
 * rated sample of all time (ties: higher average). Null when nothing has a rating.
 */
export function pickSampleOfTheWeek<T extends { id: string; inRankings?: boolean; ratingAvg: number | null; ratingCount: number; weekAvg: number | null; weekCount: number }>(
  listed: readonly T[],
): T | null {
  const samples = listed.filter((s) => s.inRankings !== false);
  const week = samples.filter((s) => s.weekCount >= 2 && s.weekAvg != null);
  if (week.length) {
    return [...week].sort((a, b) => (b.weekAvg ?? 0) - (a.weekAvg ?? 0) || b.weekCount - a.weekCount)[0] ?? null;
  }
  const rated = samples.filter((s) => s.ratingCount > 0);
  if (!rated.length) return null;
  return [...rated].sort((a, b) => b.ratingCount - a.ratingCount || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0))[0] ?? null;
}

/** Lab metadata in a separate read, so a DB without the lab columns still lists samples. */
type SampleLabMeta = {
  sampleType: string | null;
  bpm: number | null;
  musicalKey: string | null;
  bars: number | null;
  createdAt: string | null;
  sampleNumber: number | null;
  description: string | null;
  descriptionEn: string | null;
};

async function sampleLabMeta(ids: string[]): Promise<Map<string, SampleLabMeta>> {
  const out = new Map<string, SampleLabMeta>();
  const admin = adminOrNull();
  if (!admin || ids.length === 0) return out;
  const columns = "id, sample_type, bpm, musical_key, bars, created_at";
  const withText = await admin.from("studio_samples").select(`${columns}, sample_number, description, description_en`).in("id", ids);
  // DB before migration 20261123170000 has no description columns.
  const withNumber = shareColumnMissing(withText.error, "description")
    ? await admin.from("studio_samples").select(`${columns}, sample_number`).in("id", ids)
    : withText;
  // DB before migration 20261121170000 has no sample_number: read the rest, number falls back.
  const { data, error } = shareColumnMissing(withNumber.error, "sample_number")
    ? await admin.from("studio_samples").select(columns).in("id", ids)
    : withNumber;
  if (error) return out;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(row.id), {
      sampleType: (row.sample_type as string | null) ?? null,
      bpm: row.bpm == null ? null : Number(row.bpm),
      musicalKey: (row.musical_key as string | null) ?? null,
      bars: row.bars == null ? null : Number(row.bars),
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      sampleNumber: row.sample_number == null ? null : Number(row.sample_number),
      description: typeof row.description === "string" ? row.description : null,
      descriptionEn: typeof row.description_en === "string" ? row.description_en : null,
    });
  }
  return out;
}

function prizeLabel(prize: { place: number; tier: string; days: number; mode: string } | undefined) {
  return prize ?? null;
}

type StoredRating = { target_id: string; user_id: string; stars: number; created_at: string };
type RatingLoad = { state: "missing" | "error" | "ok"; rows: StoredRating[] };

type BoardWork = Work & { producer: string | null; source: "beat" | "sample" };

async function loadRatingWindow(admin: Admin, kind: TargetKind, period: PeriodWindow): Promise<RatingLoad> {
  const loaded = await admin
    .from(RATINGS)
    .select("target_id, user_id, stars, created_at")
    .eq("target_kind", kind)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .limit(5000);
  if (missingCommunity(loaded.error)) return { state: "missing", rows: [] };
  if (loaded.error) return { state: "error", rows: [] };
  return { state: "ok", rows: (loaded.data ?? []) as StoredRating[] };
}

function storedToInputs(rows: readonly StoredRating[], works: Map<string, Work>): RatingInput[] {
  return rows.flatMap((row) => {
    const work = works.get(row.target_id);
    if (!work) return [];
    return [{
      targetId: row.target_id,
      ownerId: work.ownerId,
      ownership: work.ownership,
      userId: row.user_id,
      stars: Number(row.stars),
      at: row.created_at,
    }];
  });
}

function scoreLoaded(load: RatingLoad, works: Map<string, Work>, period: PeriodWindow) {
  if (load.state === "missing") return null;
  if (load.state === "error") return [];
  return rankTargets(aggregateRatings(storedToInputs(load.rows, works), period.start, period.end));
}

async function settleLoaded(
  admin: Admin,
  kind: TargetKind,
  period: PeriodWindow,
  works: Map<string, Work>,
  load: RatingLoad,
): Promise<boolean> {
  if (!period.closed) return true;
  if (load.state === "missing") return false;
  if (load.state === "error") return true;
  const prizes = prizesFor(period.kind, rankTargets(aggregateRatings(storedToInputs(load.rows, works), period.start, period.end)));
  if (prizes.length === 0) return true;
  const saved = await admin.from(REWARDS).upsert(
    prizes.map((prize) => ({
      user_id: prize.ownerId,
      period_kind: period.kind,
      period_key: period.key,
      place: prize.place,
      target_kind: kind,
      target_id: prize.targetId,
      reward_mode: prize.mode,
      reward_tier: prize.tier,
      reward_days: prize.days,
    })),
    { onConflict: "period_kind,period_key,target_kind,place", ignoreDuplicates: true },
  );
  return !missingCommunity(saved.error);
}

async function settlePeriod(admin: Admin, kind: TargetKind, period: PeriodWindow, works: Map<string, Work>): Promise<boolean> {
  return settleLoaded(admin, kind, period, works, await loadRatingWindow(admin, kind, period));
}

/** Public works whose author entered the ranking (the database keeps ratings and comments on for them). */
async function loadBoardWorks(kind: TargetKind, client?: Admin): Promise<BoardWork[]> {
  if (kind === "beat") {
    const beats = await listPublishedBeatBoardKeys(client);
    return beats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      ownerId: beat.ownerId,
      ownership: beat.ownershipType,
      allowComments: true,
      allowRatings: true,
      author: "",
      producer: beat.producer,
      source: "beat" as const,
    }));
  }
  const rows = (await loadPublishedSampleRows()).filter((row) => row.in_rankings === true);
  const platform = await platformSampleOwners(rows.map((row) => row.owner_id));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    ownership: platform.has(row.owner_id) ? ("PLATFORM" as const) : ("USER" as const),
    allowComments: row.allow_comments === true,
    allowRatings: row.allow_ratings === true,
    author: "",
    producer: null,
    source: "sample" as const,
    kind: row.kind,
    instrument: row.instrument,
    durationMs: Number(row.duration_ms),
  }));
}

function boardAuthorHref(work: BoardWork | undefined, names: Map<string, string | null>, creators: Map<string, string>): string | null {
  return work?.ownership === "USER" && work.ownerId ? creatorHref(creators, work.ownerId, names.get(work.ownerId)) : null;
}

function boardAuthor(work: BoardWork, names: Map<string, string | null>): string {
  const displayName = work.ownerId ? (names.get(work.ownerId) ?? null) : null;
  if (work.source === "sample") {
    return work.ownership === "PLATFORM"
      ? publicAuthorName({ ownership: "PLATFORM" })
      : publicAuthorName({ ownership: "USER", displayName });
  }
  return resolvePublicAuthor({
    ownershipType: work.ownership === "USER" ? "USER" : "PLATFORM",
    ownerId: work.ownerId,
    producer: work.producer,
    ownerDisplayName: displayName,
  });
}

async function readBoardAt(kind: TargetKind, periodKind: PeriodKind, now: Date): Promise<Board> {
  const period = warsawPeriod(now, periodKind);
  const empty: Board = { enabled: false, periodKey: period.key, closed: period.closed, rows: [], champion: null };
  const admin = adminOrNull();
  if (!admin) return empty;
  const previous = previousPeriod(period, now);
  const [listed, currentLoad, previousLoad] = await Promise.all([
    loadBoardWorks(kind),
    loadRatingWindow(admin, kind, period),
    loadRatingWindow(admin, kind, previous),
  ]);
  const works = new Map(listed.map((work) => [work.id, work]));
  const ranked = scoreLoaded(currentLoad, works, period);
  if (!ranked) return empty;
  // A missing previous window hides the champion only. The open board stays.
  const previousRanked = scoreLoaded(previousLoad, works, previous) ?? [];
  const leader = previousRanked[0];
  const shownOwnerIds: string[] = [];
  for (const row of ranked.slice(0, BOARD_ROWS)) {
    const work = works.get(row.targetId);
    if (work?.ownership === "USER" && work.ownerId) shownOwnerIds.push(work.ownerId);
  }
  if (leader) {
    const work = works.get(leader.targetId);
    if (work?.ownership === "USER" && work.ownerId) shownOwnerIds.push(work.ownerId);
  }
  const [settled, names, creators] = await Promise.all([
    settleLoaded(admin, kind, period, works, currentLoad),
    authorNames(shownOwnerIds),
    loadCreatorIds(shownOwnerIds),
    settleLoaded(admin, kind, previous, works, previousLoad),
  ]);
  if (!settled) return empty;
  const prizes = new Map(
    (period.closed ? prizesFor(period.kind, ranked) : []).map((prize) => [prize.targetId, prize]),
  );
  const leaderWork = leader ? works.get(leader.targetId) : undefined;
  return {
    enabled: true,
    periodKey: period.key,
    closed: period.closed,
    rows: ranked.slice(0, BOARD_ROWS).map((row) => {
      const work = works.get(row.targetId);
      const prize = prizes.get(row.targetId);
      return {
        place: row.place,
        targetId: row.targetId,
        title: work?.title ?? "—",
        author: work ? boardAuthor(work, names) : ANONYMIZED_PUBLIC_AUTHOR,
        ...hrefField(boardAuthorHref(work, names, creators)),
        score: row.score,
        count: row.count,
        prize: prizeLabel(prize ? { place: prize.place, tier: prize.tier, days: prize.days, mode: prize.mode } : undefined),
        userOwned: work?.ownership === "USER",
      };
    }),
    champion: leader && leaderWork
      ? { targetId: leader.targetId, title: leaderWork.title, author: boardAuthor(leaderWork, names), ...hrefField(boardAuthorHref(leaderWork, names, creators)), userOwned: leaderWork.ownership === "USER" }
      : null,
  };
}

/** Places shown on an open board, with the owner (server only; public profiles). No prize settling, no request data. */
export async function readBoardPlaces(
  kind: TargetKind,
  periodKind: PeriodKind,
  now = new Date(),
): Promise<Array<{ place: number; targetId: string; title: string; ownerId: string }>> {
  const admin = adminOrNull();
  if (!admin) return [];
  const period = warsawPeriod(now, periodKind);
  const [listed, load] = await Promise.all([loadBoardWorks(kind, admin), loadRatingWindow(admin, kind, period)]);
  const works = new Map(listed.map((work) => [work.id, work]));
  return (scoreLoaded(load, works, period) ?? []).slice(0, BOARD_ROWS).flatMap((row) => {
    const work = works.get(row.targetId);
    return work?.ownership === "USER" && work.ownerId
      ? [{ place: row.place, targetId: row.targetId, title: work.title, ownerId: work.ownerId }]
      : [];
  });
}

/** One board per request. The page starts it before the shell waits on the profile. */
export const readBoard = cache(function readBoard(kind: TargetKind, periodKind: PeriodKind): Promise<Board> {
  return readBoardAt(kind, periodKind, new Date());
});

async function findPublishedBeat(id: string): Promise<Work | null> {
  if (!isUuid(id)) return null;
  const beat = await getPublishedBeat(id);
  if (!beat || beat.visibility === "private") return null;
  const names =
    beat.ownershipType === "USER" && beat.ownerId
      ? await authorNames([beat.ownerId])
      : new Map<string, string | null>();
  const flags = await beatConsentFlags(beat.id);
  return {
    id: beat.id,
    title: beat.title,
    ownerId: beat.ownerId,
    ownership: beat.ownershipType === "USER" ? "USER" : "PLATFORM",
    allowComments: flags.allowComments,
    allowRatings: flags.allowRatings,
    author: resolvePublicAuthor({
      ownershipType: beat.ownershipType,
      ownerId: beat.ownerId,
      producer: beat.producer,
      ownerDisplayName: beat.ownerId ? (names.get(beat.ownerId) ?? null) : null,
    }),
  };
}

export async function findWork(kind: TargetKind | "work", id: string): Promise<Work | null> {
  if (kind === "work") {
    const card = await findLiveCatalogWork(id);
    if (!card) return null;
    return {
      id: card.id,
      title: card.title,
      ownerId: card.ownerId,
      author: card.author,
      ownership: "USER",
      allowComments: card.allowComments,
      allowRatings: card.allowRatings,
    };
  }
  if (kind === "beat") return findPublishedBeat(id);
  const works = await publishedSamples();
  return works.find((work) => work.id === id) ?? null;
}

export async function loadThread(kind: TargetKind | "work", id: string, viewerId: string | null): Promise<Thread> {
  const blank: Thread = {
    enabled: false,
    found: false,
    own: false,
    commentsOpen: false,
    ratingsOpen: false,
    average: null,
    count: 0,
    mine: null,
    comments: [],
  };
  if (!isUuid(id)) return { ...blank, enabled: true };
  const work = await findWork(kind, id);
  if (!work) return { ...blank, enabled: true };
  const commentsOpen = canCommentPublic({ published: true, listed: true, allowComments: work.allowComments });
  const ratingsOpen = work.allowRatings !== false;
  const own = viewerId !== null && viewerId === work.ownerId;
  const admin = adminOrNull();
  if (!admin) return { ...blank, found: true, own, commentsOpen, ratingsOpen };
  const [ratings, comments, viewerRole] = await Promise.all([
    ratingsOpen
      ? admin.from(RATINGS).select("user_id, stars").eq("target_kind", kind).eq("target_id", id)
      : Promise.resolve({ data: [], error: null }),
    commentsOpen ? loadVisibleComments(admin, kind, id) : Promise.resolve({ data: [], error: null }),
    commentsOpen && viewerId ? loadViewerRole(admin, viewerId) : Promise.resolve(null),
  ]);
  if (missingCommunity(ratings.error) || missingCommunity(comments.error)) {
    return { ...blank, found: true, own, commentsOpen, ratingsOpen };
  }
  const votes = ((ratings.data ?? []) as Array<{ user_id: string; stars: number }>)
    .filter((row) => row.user_id !== work.ownerId);
  const count = votes.length;
  const average = count ? votes.reduce((sum, row) => sum + Number(row.stars), 0) / count : null;
  const mine = viewerId ? votes.find((row) => row.user_id === viewerId)?.stars ?? null : null;
  const commentRows = ((comments.data ?? []) as Array<{ id: string; user_id: string; body: string; created_at: string }>).reverse();
  const commenters = commentRows.map((row) => row.user_id);
  const [names, creators] = await Promise.all([authorNames(commenters), loadCreatorIds(commenters)]);
  return {
    enabled: true,
    found: true,
    own,
    commentsOpen,
    ratingsOpen,
    average,
    count,
    mine: mine == null ? null : Number(mine),
    comments: commentRows.map((row) => ({
      id: row.id,
      author: publicAuthorName({ ownership: "USER", displayName: names.get(row.user_id) }),
      ...hrefField(creatorHref(creators, row.user_id, names.get(row.user_id))),
      body: row.body,
      createdAt: row.created_at,
      mine: canDeleteComment(viewerId, row.user_id),
      canHide: hideRole({ viewerId, workOwnerId: work.ownerId, role: viewerRole }) !== null,
    })),
  };
}

/**
 * Newest 40 comments a visitor may see: deleted and hidden ones never leave the server.
 * A DB before migration 20261122130000 has no moderation columns, so it reads unfiltered.
 */
async function loadVisibleComments(admin: Admin, kind: TargetKind | "work", id: string) {
  const columns = "id, user_id, body, created_at";
  const filtered = await admin
    .from(COMMENTS)
    .select(columns)
    .eq("target_kind", kind)
    .eq("target_id", id)
    .is("deleted_at", null)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!shareColumnMissing(filtered.error, "deleted_at") && !shareColumnMissing(filtered.error, "hidden_at")) return filtered;
  return admin
    .from(COMMENTS)
    .select(columns)
    .eq("target_kind", kind)
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(40);
}

async function loadViewerRole(admin: Admin, viewerId: string): Promise<SystemRole | null> {
  const { data, error } = await admin.from("profiles").select("role").eq("id", viewerId).maybeSingle();
  if (error || !data) return null;
  return (data as { role?: SystemRole }).role ?? null;
}

export async function rateTarget(userId: string, kind: TargetKind | "work", id: string, stars: number): Promise<"ok" | "own" | "missing" | "invalid" | "off" | "closed"> {
  if (!isUuid(id) || !Number.isInteger(stars) || stars < 1 || stars > 5) return "invalid";
  const work = await findWork(kind, id);
  if (!work) return "missing";
  if (work.allowRatings === false) return "closed";
  if (work.ownerId === userId) return "own";
  const admin = adminOrNull();
  if (!admin) return "off";
  // A re-rate counts in the period it is cast: ranking windows key on created_at, so
  // moving it to now keeps closed periods frozen and lets a re-vote count this period.
  const at = new Date().toISOString();
  const saved = await admin.from(RATINGS).upsert(
    { target_kind: kind, target_id: id, user_id: userId, stars, created_at: at, updated_at: at },
    { onConflict: "target_kind,target_id,user_id" },
  );
  if (missingCommunity(saved.error)) return "off";
  if (saved.error) return "invalid";
  return "ok";
}

export type CommentResult = "ok" | "missing" | "closed" | "invalid" | "limit" | "off";

/** `id` is the new comment, so its author can delete it without a reload. */
export async function commentTarget(userId: string, kind: TargetKind | "work", id: string, body: unknown): Promise<{ result: CommentResult; id?: string }> {
  const text = cleanComment(body);
  if (!text || text.length > COMMENT_MAX) return { result: "invalid" };
  if (!isUuid(id)) return { result: "invalid" };
  const work = await findWork(kind, id);
  if (!work) return { result: "missing" };
  if (!canCommentPublic({ published: true, listed: true, allowComments: work.allowComments })) return { result: "closed" };
  const admin = adminOrNull();
  if (!admin) return { result: "off" };
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  // Deleted and hidden comments still count, so delete-and-repost cannot dodge the limit.
  const recent = await admin.from(COMMENTS).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (missingCommunity(recent.error)) return { result: "off" };
  if ((recent.count ?? 0) >= 20) return { result: "limit" };
  const saved = await admin.from(COMMENTS).insert({ target_kind: kind, target_id: id, user_id: userId, body: text }).select("id").maybeSingle();
  if (missingCommunity(saved.error)) return { result: "off" };
  if (saved.error) return { result: "invalid" };
  const newId = (saved.data as { id?: unknown } | null)?.id;
  return typeof newId === "string" ? { result: "ok", id: newId } : { result: "ok" };
}

async function titlesOf(admin: Admin, table: "beats" | "studio_samples", ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const loaded = await admin.from(table).select("id, title").in("id", ids);
  return new Map(((loaded.data ?? []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]));
}

export async function listMyRewards(userId: string, now = new Date()): Promise<{ enabled: boolean; rewards: RewardView[] }> {
  const admin = adminOrNull();
  if (!admin) return { enabled: false, rewards: [] };
  const week = warsawPeriod(now, "week");
  const month = warsawPeriod(now, "month");
  for (const kind of ["beat", "sample"] as const) {
    const works = new Map((await loadBoardWorks(kind)).map((work) => [work.id, work]));
    const weekOk = await settlePeriod(admin, kind, previousPeriod(week, now), works);
    const monthOk = await settlePeriod(admin, kind, previousPeriod(month, now), works);
    if (!weekOk || !monthOk) return { enabled: false, rewards: [] };
  }
  const loaded = await admin
    .from(REWARDS)
    .select("id, period_kind, period_key, place, target_kind, target_id, reward_mode, reward_tier, reward_days, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (missingCommunity(loaded.error)) return { enabled: false, rewards: [] };
  if (loaded.error) return { enabled: true, rewards: [] };
  const rows = (loaded.data ?? []) as Array<{
    id: string;
    period_kind: PeriodKind;
    period_key: string;
    place: number;
    target_kind: TargetKind;
    target_id: string;
    reward_mode: string;
    reward_tier: string;
    reward_days: number;
    status: string;
  }>;
  // The title stays readable also when the work has left the catalogue or the ranking.
  const [beatTitles, sampleTitles] = await Promise.all([
    titlesOf(admin, "beats", rows.filter((row) => row.target_kind === "beat").map((row) => row.target_id)),
    titlesOf(admin, "studio_samples", rows.filter((row) => row.target_kind === "sample").map((row) => row.target_id)),
  ]);
  return {
    enabled: true,
    rewards: rows.map((row) => ({
      id: row.id,
      periodKind: row.period_kind,
      periodKey: row.period_key,
      place: row.place,
      targetKind: row.target_kind,
      title: (row.target_kind === "beat" ? beatTitles : sampleTitles).get(row.target_id) ?? "—",
      mode: row.reward_mode,
      tier: row.reward_tier,
      days: row.reward_days,
      status: row.status,
    })),
  };
}

export async function claimMyReward(userId: string, rewardId: string, now = new Date()): Promise<"ok" | "perpetual" | "pending_plan" | "conflict" | "missing" | "off" | "already" | "wait" | "invalid"> {
  if (!isUuid(rewardId)) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const loaded = await admin
    .from(REWARDS)
    .select("id, reward_mode, reward_tier, reward_days, status, user_id")
    .eq("id", rewardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (missingCommunity(loaded.error)) return "off";
  if (!loaded.data) return "missing";
  const row = loaded.data as {
    reward_mode: "extend_days" | "package_month";
    reward_tier: "EXTEND" | "BRONZE" | "SILVER" | "GOLD";
    reward_days: number;
    status: string;
  };
  if (row.status === "claimed") return "already";
  let plan = null;
  try {
    plan = await loadPlanSnapshot(userId);
  } catch {
    return "conflict";
  }
  const write = rewardGrant(
    { mode: row.reward_mode, tier: row.reward_tier, days: row.reward_days },
    plan,
    now,
  );
  if (write.action === "skip") return write.note === "pending_plan" ? "pending_plan" : "perpetual";
  if (write.action !== "plan" && write.action !== "schedule") return "conflict";
  return claimCommunityReward(admin, userId, rewardId, write);
}

import "server-only";

import { isUuid } from "@/lib/beats/audio-validation";
import { loadPublicAuthorDisplayNames } from "@/lib/beats/public-author";
import { resolvePublicAuthor } from "@/lib/beats/public-author-resolve";
import { listPublishedBeats } from "@/lib/beats/service";
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
  type TargetKind,
} from "@/lib/community/ranking-policy";
import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { claimCommunityReward } from "@/lib/community/reward-apply";
import { canCommentPublic, publicAuthorName } from "@/lib/community/share-policy";
import { loadPlanSnapshot } from "@/lib/payments/snapshots";
import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RATINGS = "community_ratings";
const COMMENTS = "community_comments";
const REWARDS = "community_rewards";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type DbError = { message?: string; code?: string } | null;

export type CatalogSource = "brd" | "user";

export type PublicSampleCard = {
  id: string;
  title: string;
  author: string;
  kind: string;
  instrument: string | null;
  durationMs: number;
};

export type BoardRow = {
  place: number;
  targetId: string;
  title: string;
  author: string;
  score: number;
  count: number;
  prize: { place: number; tier: string; days: number; mode: string } | null;
};

export type Board = {
  enabled: boolean;
  periodKey: string;
  closed: boolean;
  rows: BoardRow[];
  champion: { targetId: string; title: string; author: string } | null;
};

export type ThreadComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type Thread = {
  enabled: boolean;
  found: boolean;
  own: boolean;
  /** False when the author turned comments off. Beat and sample ratings stay. */
  commentsOpen: boolean;
  /** False only for a finished track whose owner left ratings off. */
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
  ownership: "PLATFORM" | "USER";
  allowComments: boolean;
  /** Absent means ratings stay open, which is the beat and sample rule. */
  allowRatings?: boolean;
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

async function authorNames(ownerIds: string[]): Promise<Map<string, string | null>> {
  try {
    return await loadPublicAuthorDisplayNames(ownerIds);
  } catch {
    return new Map();
  }
}

async function beatCommentFlags(ids: string[]): Promise<Map<string, boolean> | null> {
  const admin = adminOrNull();
  if (!admin || ids.length === 0) return null;
  const flags = new Map<string, boolean>();
  for (let index = 0; index < ids.length; index += 100) {
    const loaded = await admin.from("beats").select("id, allow_comments").in("id", ids.slice(index, index + 100));
    if (shareColumnMissing(loaded.error, "allow_comments")) return null;
    if (loaded.error) return new Map(ids.map((id) => [id, false]));
    for (const row of (loaded.data ?? []) as Array<{ id: string; allow_comments?: boolean }>) {
      flags.set(row.id, row.allow_comments !== false);
    }
  }
  return flags;
}

async function publishedWorks(kind: TargetKind | "work"): Promise<Work[]> {
  if (kind === "work") return [];
  if (kind === "beat") {
    const beats = await listPublishedBeats();
    const names = await authorNames(
      beats.filter((beat) => beat.ownershipType === "USER" && beat.ownerId).map((beat) => beat.ownerId as string),
    );
    const flags = await beatCommentFlags(beats.map((beat) => beat.id));
    return beats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      ownerId: beat.ownerId,
      ownership: beat.ownershipType === "USER" ? "USER" : "PLATFORM",
      allowComments: flags?.get(beat.id) ?? true,
      author: resolvePublicAuthor({
        ownershipType: beat.ownershipType,
        ownerId: beat.ownerId,
        producer: beat.producer,
        ownerDisplayName: beat.ownerId ? names.get(beat.ownerId) : null,
      }),
    }));
  }
  const admin = adminOrNull();
  if (!admin) return [];
  const flagged = await admin
    .from("studio_samples")
    .select("id, owner_id, title, kind, instrument, duration_ms, public_listing, allow_comments")
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false })
    .limit(200);
  const flagsMissing = shareColumnMissing(flagged.error, "public_listing") || shareColumnMissing(flagged.error, "allow_comments");
  const loaded = flagsMissing
    ? await admin
        .from("studio_samples")
        .select("id, owner_id, title, kind, instrument, duration_ms")
        .eq("status", "PUBLISHED")
        .order("created_at", { ascending: false })
        .limit(200)
    : flagged;
  if (loaded.error) return [];
  const rows = (loaded.data ?? []) as Array<{
    id: string;
    owner_id: string;
    title: string;
    kind: string;
    instrument: string | null;
    duration_ms: number;
    public_listing?: boolean;
    allow_comments?: boolean;
  }>;
  const names = await authorNames(rows.map((row) => row.owner_id));
  return rows.flatMap((row) => {
    const listed = flagsMissing ? true : row.public_listing === true;
    if (!listed) return [];
    return [{
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      ownership: "USER" as const,
      allowComments: flagsMissing ? true : row.allow_comments !== false,
      author: publicAuthorName({ ownership: "USER", displayName: names.get(row.owner_id) }),
      kind: row.kind,
      instrument: row.instrument,
      durationMs: Number(row.duration_ms),
    }];
  });
}

export async function listPublicSamples(source: CatalogSource): Promise<PublicSampleCard[]> {
  if (source === "brd") return [];
  const works = await publishedWorks("sample");
  return works.map((work) => ({
    id: work.id,
    title: work.title,
    author: work.author,
    kind: work.kind === "effect" ? "effect" : "instrument",
    instrument: work.instrument ?? null,
    durationMs: work.durationMs ?? 0,
  }));
}

function prizeLabel(prize: { place: number; tier: string; days: number; mode: string } | undefined) {
  return prize ?? null;
}

async function settlePeriod(admin: Admin, kind: TargetKind, period: PeriodWindow, works: Map<string, Work>): Promise<boolean> {
  if (!period.closed) return true;
  const loaded = await admin
    .from(RATINGS)
    .select("target_id, user_id, stars, created_at")
    .eq("target_kind", kind)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .limit(5000);
  if (missingCommunity(loaded.error)) return false;
  if (loaded.error) return true;
  const ratings = ((loaded.data ?? []) as Array<{ target_id: string; user_id: string; stars: number; created_at: string }>)
    .map((row) => {
      const work = works.get(row.target_id);
      if (!work) return null;
      return {
        targetId: row.target_id,
        ownerId: work.ownerId,
        userId: row.user_id,
        stars: Number(row.stars),
        at: row.created_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const prizes = prizesFor(period.kind, rankTargets(aggregateRatings(ratings, period.start, period.end)));
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

async function scorePeriod(admin: Admin, kind: TargetKind, period: PeriodWindow, works: Map<string, Work>) {
  const loaded = await admin
    .from(RATINGS)
    .select("target_id, user_id, stars, created_at")
    .eq("target_kind", kind)
    .gte("created_at", period.start.toISOString())
    .lt("created_at", period.end.toISOString())
    .limit(5000);
  if (missingCommunity(loaded.error)) return null;
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
  return rankTargets(aggregateRatings(ratings, period.start, period.end));
}

export async function readBoard(kind: TargetKind, periodKind: PeriodKind, now = new Date()): Promise<Board> {
  const period = warsawPeriod(now, periodKind);
  const empty: Board = { enabled: false, periodKey: period.key, closed: period.closed, rows: [], champion: null };
  const admin = adminOrNull();
  if (!admin) return empty;
  const works = new Map((await publishedWorks(kind)).map((work) => [work.id, work]));
  const ranked = await scorePeriod(admin, kind, period, works);
  if (!ranked) return empty;
  const settled = await settlePeriod(admin, kind, period, works);
  if (!settled) return empty;
  const previous = previousPeriod(period, now);
  await settlePeriod(admin, kind, previous, works);
  const prizes = new Map(
    (period.closed ? prizesFor(period.kind, ranked) : []).map((prize) => [prize.targetId, prize]),
  );
  const previousRanked = await scorePeriod(admin, kind, previous, works);
  const leader = previousRanked?.[0];
  const leaderWork = leader ? works.get(leader.targetId) : undefined;
  return {
    enabled: true,
    periodKey: period.key,
    closed: period.closed,
    rows: ranked.slice(0, 20).map((row) => {
      const work = works.get(row.targetId);
      const prize = prizes.get(row.targetId);
      return {
        place: row.place,
        targetId: row.targetId,
        title: work?.title ?? "—",
        author: work?.author ?? ANONYMIZED_PUBLIC_AUTHOR,
        score: row.score,
        count: row.count,
        prize: prizeLabel(prize ? { place: prize.place, tier: prize.tier, days: prize.days, mode: prize.mode } : undefined),
      };
    }),
    champion: leader && leaderWork
      ? { targetId: leader.targetId, title: leaderWork.title, author: leaderWork.author }
      : null,
  };
}

async function findWork(kind: TargetKind | "work", id: string): Promise<Work | null> {
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
  const works = await publishedWorks(kind);
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
  const [ratings, comments] = await Promise.all([
    ratingsOpen
      ? admin.from(RATINGS).select("user_id, stars").eq("target_kind", kind).eq("target_id", id)
      : Promise.resolve({ data: [], error: null }),
    commentsOpen
      ? admin.from(COMMENTS).select("id, user_id, body, created_at").eq("target_kind", kind).eq("target_id", id).order("created_at", { ascending: false }).limit(40)
      : Promise.resolve({ data: [], error: null }),
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
  const names = await authorNames(commentRows.map((row) => row.user_id));
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
      body: row.body,
      createdAt: row.created_at,
    })),
  };
}

export async function rateTarget(userId: string, kind: TargetKind | "work", id: string, stars: number): Promise<"ok" | "own" | "missing" | "invalid" | "off" | "closed"> {
  if (!isUuid(id) || !Number.isInteger(stars) || stars < 1 || stars > 5) return "invalid";
  const work = await findWork(kind, id);
  if (!work) return "missing";
  if (work.allowRatings === false) return "closed";
  if (work.ownerId === userId) return "own";
  const admin = adminOrNull();
  if (!admin) return "off";
  const saved = await admin.from(RATINGS).upsert(
    { target_kind: kind, target_id: id, user_id: userId, stars, updated_at: new Date().toISOString() },
    { onConflict: "target_kind,target_id,user_id" },
  );
  if (missingCommunity(saved.error)) return "off";
  if (saved.error) return "invalid";
  return "ok";
}

export async function commentTarget(userId: string, kind: TargetKind | "work", id: string, body: unknown): Promise<"ok" | "missing" | "closed" | "invalid" | "limit" | "off"> {
  const text = cleanComment(body);
  if (!text || text.length > COMMENT_MAX) return "invalid";
  if (!isUuid(id)) return "invalid";
  const work = await findWork(kind, id);
  if (!work) return "missing";
  if (!canCommentPublic({ published: true, listed: true, allowComments: work.allowComments })) return "closed";
  const admin = adminOrNull();
  if (!admin) return "off";
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin.from(COMMENTS).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (missingCommunity(recent.error)) return "off";
  if ((recent.count ?? 0) >= 20) return "limit";
  const saved = await admin.from(COMMENTS).insert({ target_kind: kind, target_id: id, user_id: userId, body: text });
  if (missingCommunity(saved.error)) return "off";
  if (saved.error) return "invalid";
  return "ok";
}

export async function listMyRewards(userId: string, now = new Date()): Promise<{ enabled: boolean; rewards: RewardView[] }> {
  const admin = adminOrNull();
  if (!admin) return { enabled: false, rewards: [] };
  const week = warsawPeriod(now, "week");
  const month = warsawPeriod(now, "month");
  for (const kind of ["beat", "sample"] as const) {
    const works = new Map((await publishedWorks(kind)).map((work) => [work.id, work]));
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
  const beatWorks = new Map((await publishedWorks("beat")).map((work) => [work.id, work]));
  const sampleWorks = new Map((await publishedWorks("sample")).map((work) => [work.id, work]));
  return {
    enabled: true,
    rewards: rows.map((row) => ({
      id: row.id,
      periodKind: row.period_kind,
      periodKey: row.period_key,
      place: row.place,
      targetKind: row.target_kind,
      title: (row.target_kind === "beat" ? beatWorks : sampleWorks).get(row.target_id)?.title ?? "—",
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

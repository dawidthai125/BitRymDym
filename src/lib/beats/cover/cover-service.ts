import "server-only";

import { randomUUID } from "node:crypto";

import { BEAT_COVER_BUCKET } from "@/config/beat-covers";
import { hasRole } from "@/lib/auth/permissions";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  coverStatusForDecision,
  type CoverModerationOutcome,
} from "@/lib/beats/cover/cover-decision";
import { processCoverImage } from "@/lib/beats/cover/cover-image";
import { moderateCoverImage } from "@/lib/beats/cover/cover-moderation";
import { BeatRequestError } from "@/lib/beats/request-error";
import {
  BEAT_USAGE_COLUMNS,
  beatUsageSubjectFromRow,
} from "@/lib/beats/usage/beat-usage-server";
import {
  canViewBeat,
  isBeatInPublicCatalogue,
  isBeatOwner,
} from "@/lib/beats/usage/beat-usage-policy";
import { hasActiveRecordGrant } from "@/lib/grants/beat-access-grants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BeatCoverStatus } from "@/types/domain";

/**
 * User beats 2026-10-30 — beat covers.
 * Private bucket `beat-covers`, written only by service_role from here.
 * Every new cover: sharp re-encode (EXIF stripped) → automatic filter →
 * auto-reject (never stored) | pending (moderator) | approved.
 */

const COVER_ROW_COLUMNS = `id, ${BEAT_USAGE_COLUMNS}, cover_path, cover_thumb_path, cover_status, cover_updated_at`;

/** Minimal spacing between uploads per beat (each upload calls the filter). */
const COVER_UPLOAD_COOLDOWN_MS = 10_000;

export const COVER_AUTO_REJECTED_MESSAGE =
  "Okładka nie przeszła automatycznego filtra treści. Wybierz inny obraz.";

type CoverRow = {
  id: string;
  status: string;
  ownership_type: string;
  owner_id: string | null;
  visibility: string | null;
  allow_download: boolean | null;
  allow_studio_use: boolean | null;
  cover_path: string | null;
  cover_thumb_path: string | null;
  cover_status: BeatCoverStatus | null;
  cover_updated_at: string | null;
};

async function loadCoverRow(beatId: string): Promise<CoverRow | null> {
  if (!isUuid(beatId)) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from("beats")
    .select(COVER_ROW_COLUMNS)
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CoverRow | null) ?? null;
}

async function loadOwnedCoverRow(
  context: AuthContext,
  beatId: string,
): Promise<CoverRow> {
  const row = await loadCoverRow(beatId);
  if (!row || row.ownership_type !== "USER" || row.owner_id !== context.userId) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  if (row.status === "ARCHIVED") {
    throw new BeatRequestError(
      "Nie można zmienić okładki zarchiwizowanego bitu.",
      "CONFLICT",
    );
  }
  return row;
}

async function removeObjects(paths: Array<string | null>): Promise<void> {
  const keys = paths.filter((p): p is string => Boolean(p));
  if (keys.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .storage.from(BEAT_COVER_BUCKET)
    .remove(keys);
  if (error) console.error("[beat-cover] remove failed:", error.message);
}

async function auditCover(params: {
  context: AuthContext;
  targetUserId: string | null;
  beatId: string;
  oldStatus: string | null;
  newStatus: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("admin_audit_events")
    .insert({
      actor_user_id: params.context.profile.id,
      target_user_id: params.targetUserId,
      actor_user_number: params.context.profile.userNumber ?? null,
      target_user_number: null,
      action: "BEAT_COVER_REVIEW",
      old_value: { coverStatus: params.oldStatus },
      new_value: { coverStatus: params.newStatus },
      metadata: { beatId: params.beatId, ...params.metadata },
    });
  if (error) console.error("[beat-cover] audit insert failed:", error.message);
}

function moderationSnapshot(m: CoverModerationOutcome) {
  return {
    provider: m.provider,
    decision: m.decision,
    flagged: m.flagged,
    maxScore: m.maxScore,
    topCategory: m.topCategory,
    scores: m.scores,
    skippedReason: m.skippedReason ?? null,
    at: new Date().toISOString(),
  };
}

export type CoverUploadResult = {
  coverStatus: "approved" | "pending";
  filter: "openai" | "none";
};

/** Owner uploads / replaces the cover of own USER beat. */
export async function uploadOwnBeatCover(
  context: AuthContext,
  beatId: string,
  bytes: Uint8Array,
): Promise<CoverUploadResult> {
  const row = await loadOwnedCoverRow(context, beatId);
  if (
    row.cover_updated_at &&
    Date.now() - new Date(row.cover_updated_at).getTime() < COVER_UPLOAD_COOLDOWN_MS
  ) {
    throw new BeatRequestError(
      "Odczekaj chwilę przed kolejną zmianą okładki.",
      "CONFLICT",
    );
  }

  const processed = await processCoverImage(bytes);
  const moderation = await moderateCoverImage(processed.moderationPreview);

  if (moderation.decision === "reject") {
    await auditCover({
      context,
      targetUserId: context.userId,
      beatId,
      oldStatus: row.cover_status,
      newStatus: "auto_rejected",
      metadata: { automatic: true, moderation: moderationSnapshot(moderation) },
    });
    throw new BeatRequestError(COVER_AUTO_REJECTED_MESSAGE);
  }

  const admin = createSupabaseAdminClient();
  const stem = `${context.userId}/${beatId}/${randomUUID()}`;
  const fullPath = `${stem}-full.webp`;
  const thumbPath = `${stem}-thumb.webp`;
  const bucket = admin.storage.from(BEAT_COVER_BUCKET);
  for (const [path, body] of [
    [fullPath, processed.full],
    [thumbPath, processed.thumb],
  ] as const) {
    const { error } = await bucket.upload(path, body, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) {
      await removeObjects([fullPath, thumbPath]);
      throw new Error(error.message);
    }
  }

  const coverStatus = coverStatusForDecision(moderation.decision);
  const { data: updated, error } = await admin
    .from("beats")
    .update({
      cover_path: fullPath,
      cover_thumb_path: thumbPath,
      cover_status: coverStatus,
      cover_moderation: moderationSnapshot(moderation),
      cover_rejection_reason: null,
      cover_updated_at: new Date().toISOString(),
    })
    .eq("id", beatId)
    .eq("owner_id", context.userId)
    .eq("ownership_type", "USER")
    .select("id");
  if (error || !updated || updated.length === 0) {
    await removeObjects([fullPath, thumbPath]);
    if (error) throw new Error(error.message);
    throw new AuthError("CONFLICT", "Beat changed during the cover update.");
  }
  await removeObjects([row.cover_path, row.cover_thumb_path]);
  return { coverStatus, filter: moderation.provider };
}

/** Owner removes the cover (falls back to generated artwork). */
export async function removeOwnBeatCover(
  context: AuthContext,
  beatId: string,
): Promise<void> {
  const row = await loadOwnedCoverRow(context, beatId);
  if (row.cover_status === "none" || !row.cover_status) return;
  const { error } = await createSupabaseAdminClient()
    .from("beats")
    .update({
      cover_path: null,
      cover_thumb_path: null,
      cover_status: "none",
      cover_moderation: null,
      cover_rejection_reason: null,
      cover_updated_at: new Date().toISOString(),
    })
    .eq("id", beatId)
    .eq("owner_id", context.userId);
  if (error) throw new Error(error.message);
  await removeObjects([row.cover_path, row.cover_thumb_path]);
}

function assertStaff(context: AuthContext): void {
  if (!hasRole(context.profile.role, ["ADMIN", "MODERATOR"])) {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }
}

export type PendingCoverItem = {
  beatId: string;
  title: string;
  ownerId: string | null;
  coverUpdatedAt: string | null;
  moderation: Record<string, unknown> | null;
};

/** Moderator queue: covers waiting for a human decision. */
export async function listPendingBeatCovers(
  context: AuthContext,
  limit = 50,
): Promise<PendingCoverItem[]> {
  assertStaff(context);
  const { data, error } = await createSupabaseAdminClient()
    .from("beats")
    .select("id, title, owner_id, cover_updated_at, cover_moderation")
    .eq("cover_status", "pending")
    .order("cover_updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    beatId: String(r.id),
    title: String(r.title ?? ""),
    ownerId: (r.owner_id as string | null) ?? null,
    coverUpdatedAt: (r.cover_updated_at as string | null) ?? null,
    moderation: (r.cover_moderation as Record<string, unknown> | null) ?? null,
  }));
}

/** Moderator approves / rejects a pending (or approved) cover. */
export async function reviewBeatCover(
  context: AuthContext,
  params: { beatId: string; decision: "approve" | "reject"; reason?: string | null },
): Promise<BeatCoverStatus> {
  assertStaff(context);
  const row = await loadCoverRow(params.beatId);
  if (!row) throw new AuthError("NOT_FOUND", "Beat not found.");
  if (row.cover_status !== "pending" && row.cover_status !== "approved") {
    throw new BeatRequestError("Brak okładki do moderacji.", "CONFLICT");
  }
  const reason = (params.reason ?? "").trim().slice(0, 500) || null;
  if (params.decision === "reject" && !reason) {
    throw new BeatRequestError("Podaj powód odrzucenia okładki.");
  }
  const next: BeatCoverStatus =
    params.decision === "approve" ? "approved" : "rejected";
  const { data: updated, error } = await createSupabaseAdminClient()
    .from("beats")
    .update({
      cover_status: next,
      cover_rejection_reason: next === "rejected" ? reason : null,
    })
    .eq("id", params.beatId)
    .eq("cover_status", row.cover_status)
    .eq("cover_path", row.cover_path ?? "")
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) {
    throw new AuthError("CONFLICT", "Cover changed during review. Reload.");
  }
  await auditCover({
    context,
    targetUserId: row.owner_id,
    beatId: params.beatId,
    oldStatus: row.cover_status,
    newStatus: next,
    metadata: { automatic: false, reason },
  });
  return next;
}

export type CoverDownload = {
  bytes: ArrayBuffer;
  /** True when the cover is visible to anyone (public catalogue + approved). */
  publicCache: boolean;
};

/**
 * Serve a cover to a viewer. Approved covers of public catalogue beats are
 * public; otherwise owner / staff (any status) or a viewer allowed to see the
 * beat (approved only).
 */
export async function loadBeatCoverForViewer(
  beatId: string,
  size: "full" | "thumb",
): Promise<CoverDownload | null> {
  const row = await loadCoverRow(beatId);
  if (!row || !row.cover_path || !row.cover_thumb_path) return null;
  if (row.cover_status === "none" || !row.cover_status) return null;

  const subject = beatUsageSubjectFromRow(row as unknown as Record<string, unknown>);
  const approved = row.cover_status === "approved";
  let publicCache = false;
  if (approved && isBeatInPublicCatalogue(subject)) {
    publicCache = true;
  } else {
    const viewer = await getCurrentProfile();
    if (!viewer) return null;
    const staff = hasRole(viewer.profile.role, ["ADMIN", "MODERATOR"]);
    const owner = isBeatOwner(subject, viewer.userId);
    if (!staff && !owner) {
      if (!approved) return null;
      const grant =
        subject.status === "PUBLISHED"
          ? await hasActiveRecordGrant({ beatId, granteeUserId: viewer.userId })
          : false;
      if (!canViewBeat(subject, { userId: viewer.userId, hasActiveGrant: grant }).allowed) {
        return null;
      }
    }
  }

  const path = size === "full" ? row.cover_path : row.cover_thumb_path;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(BEAT_COVER_BUCKET)
    .download(path);
  if (error || !data) {
    console.error("[beat-cover] download failed:", error?.message ?? "empty");
    return null;
  }
  return { bytes: await data.arrayBuffer(), publicCache };
}

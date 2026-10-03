/**
 * Creator Progress W1 — central server-only experience award service.
 * All product awards go through awardExperience → RPC award_creator_experience.
 */

import "server-only";

import {
  CREATOR_EXPERIENCE_AMOUNTS,
  CREATOR_EXPERIENCE_DAILY_CAPS,
  idempotencyKeyFor,
} from "@/config/creator-experience";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreatorExperienceEventType } from "@/types/creator-progress";

export type AwardExperienceResult =
  | {
      awarded: true;
      eventId: string;
      experienceTotal: number;
    }
  | {
      awarded: false;
      reason: "IDEMPOTENT" | "DAILY_CAP" | "SKIPPED" | "ERROR";
      experienceTotal: number | null;
      detail?: string;
    };

type RpcRow = {
  awarded?: boolean;
  reason?: string;
  event_id?: string;
  experience_total?: number;
  day_count?: number;
};

function mapRpc(data: unknown): AwardExperienceResult {
  const row = (data ?? {}) as RpcRow;
  const total =
    typeof row.experience_total === "number" ? row.experience_total : null;
  if (row.awarded === true && typeof row.event_id === "string") {
    return {
      awarded: true,
      eventId: row.event_id,
      experienceTotal: total ?? 0,
    };
  }
  const reason =
    row.reason === "DAILY_CAP"
      ? "DAILY_CAP"
      : row.reason === "IDEMPOTENT"
        ? "IDEMPOTENT"
        : "ERROR";
  return {
    awarded: false,
    reason,
    experienceTotal: total,
    detail: typeof row.reason === "string" ? row.reason : undefined,
  };
}

/**
 * Low-level award. Amount/event chosen by server callers only — never from client.
 */
export async function awardExperience(params: {
  userId: string;
  eventType: CreatorExperienceEventType;
  subjectId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  dailyCap?: number | null;
}): Promise<AwardExperienceResult> {
  if (!params.userId || !params.subjectId || !params.idempotencyKey) {
    return {
      awarded: false,
      reason: "SKIPPED",
      experienceTotal: null,
      detail: "missing identity",
    };
  }
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    return {
      awarded: false,
      reason: "SKIPPED",
      experienceTotal: null,
      detail: "invalid amount",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("award_creator_experience", {
    p_user_id: params.userId,
    p_event_type: params.eventType,
    p_subject_id: params.subjectId,
    p_amount: Math.trunc(params.amount),
    p_idempotency_key: params.idempotencyKey,
    p_metadata: params.metadata ?? {},
    p_daily_cap:
      params.dailyCap === undefined ? null : params.dailyCap,
  });

  if (error) {
    return {
      awarded: false,
      reason: "ERROR",
      experienceTotal: null,
      detail: error.message,
    };
  }
  return mapRpc(data);
}

/** Product event helper — amount/caps from config SSOT. */
export async function awardProductExperience(params: {
  userId: string;
  eventType: Exclude<CreatorExperienceEventType, "ADMIN_CORRECTION">;
  subjectId: string;
  metadata?: Record<string, unknown>;
}): Promise<AwardExperienceResult> {
  const amount = CREATOR_EXPERIENCE_AMOUNTS[params.eventType];
  const dailyCap = CREATOR_EXPERIENCE_DAILY_CAPS[params.eventType] ?? null;
  return awardExperience({
    userId: params.userId,
    eventType: params.eventType,
    subjectId: params.subjectId,
    amount,
    idempotencyKey: idempotencyKeyFor(params.eventType, params.subjectId),
    metadata: params.metadata,
    dailyCap,
  });
}

/** Admin/service correction — requires reason metadata. */
export async function awardAdminCorrection(params: {
  userId: string;
  subjectId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<AwardExperienceResult> {
  const reason = params.reason.trim();
  if (!reason) {
    return {
      awarded: false,
      reason: "SKIPPED",
      experienceTotal: null,
      detail: "correction reason required",
    };
  }
  return awardExperience({
    userId: params.userId,
    eventType: "ADMIN_CORRECTION",
    subjectId: params.subjectId,
    amount: Math.trunc(params.amount),
    idempotencyKey: idempotencyKeyFor("ADMIN_CORRECTION", params.subjectId),
    metadata: { ...params.metadata, reason },
    dailyCap: null,
  });
}

export async function awardProfileCompleted(
  userId: string,
): Promise<AwardExperienceResult> {
  return awardProductExperience({
    userId,
    eventType: "PROFILE_COMPLETED",
    subjectId: userId,
  });
}

export async function awardBeatApproved(params: {
  ownerUserId: string;
  beatId: string;
}): Promise<AwardExperienceResult> {
  if (!params.ownerUserId) {
    return {
      awarded: false,
      reason: "SKIPPED",
      experienceTotal: null,
      detail: "no owner",
    };
  }
  return awardProductExperience({
    userId: params.ownerUserId,
    eventType: "BEAT_APPROVED",
    subjectId: params.beatId,
    metadata: { beat_id: params.beatId },
  });
}

export async function awardBeatFirstPublished(params: {
  ownerUserId: string;
  beatId: string;
}): Promise<AwardExperienceResult> {
  if (!params.ownerUserId) {
    return {
      awarded: false,
      reason: "SKIPPED",
      experienceTotal: null,
      detail: "no owner",
    };
  }
  return awardProductExperience({
    userId: params.ownerUserId,
    eventType: "BEAT_FIRST_PUBLISHED",
    subjectId: params.beatId,
    metadata: { beat_id: params.beatId },
  });
}

export async function awardMixSessionFirstExport(params: {
  ownerUserId: string;
  mixSessionId: string;
  renderJobId: string;
}): Promise<AwardExperienceResult> {
  return awardProductExperience({
    userId: params.ownerUserId,
    eventType: "MIX_SESSION_FIRST_EXPORT",
    subjectId: params.mixSessionId,
    metadata: {
      mix_session_id: params.mixSessionId,
      render_job_id: params.renderJobId,
    },
  });
}

export async function awardRenderSucceeded(params: {
  ownerUserId: string;
  renderJobId: string;
}): Promise<AwardExperienceResult> {
  return awardProductExperience({
    userId: params.ownerUserId,
    eventType: "RENDER_SUCCEEDED",
    subjectId: params.renderJobId,
    metadata: { render_job_id: params.renderJobId },
  });
}

/** Auth takes only — callers must not invoke for anonymous. */
export async function awardTakeReady(params: {
  ownerUserId: string;
  takeId: string;
}): Promise<AwardExperienceResult> {
  return awardProductExperience({
    userId: params.ownerUserId,
    eventType: "TAKE_READY",
    subjectId: params.takeId,
    metadata: { take_id: params.takeId },
  });
}

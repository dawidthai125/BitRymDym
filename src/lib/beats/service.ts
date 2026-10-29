import "server-only";

import type { Beat, BeatStatus } from "@/types/domain";
import {
  AuthError,
  requirePermission,
  requireRole,
  requireUser,
} from "@/lib/auth/session";
import {
  assertPublishHardGate,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import {
  assertUserBeatObjectKeyBinding,
  isUuid,
} from "@/lib/beats/audio-validation";
import {
  assertSubmitCooldown,
} from "@/lib/beats/submit-cooldown";
import {
  USER_RIGHTS_STATEMENT_VERSION,
  evaluateUserPublishRights,
  staffMayModerateBeat,
} from "@/lib/beats/rights-policy";
import {
  canTransitionStatus,
  validateBeatInput,
  validateRejectionReason,
  type BeatInput,
} from "@/lib/beats/validation";
import { withPublicAuthors } from "@/lib/beats/public-author";
import {
  diffBeatMetadataForAudit,
  parseUploadDateInput,
} from "@/lib/beats/admin-beat-edit";
import {
  ADMIN_BEATS_SORT_COLUMNS,
  adminBeatsPageCount,
  adminBeatsRange,
  type AdminBeatsQuery,
} from "@/lib/beats/admin-catalogue-query";
import { BeatRequestError } from "@/lib/beats/request-error";
import {
  BEAT_SELECT_FULL,
  BEAT_SELECT_PUBLIC,
  mapBeatRow,
  mapPublicBeatRow,
  toBeatInsertPayload,
  toBeatMetadataPayload,
  type BeatRow,
} from "@/lib/beats/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformBeatAdminListItem = Beat & {
  activeMasterReady: boolean;
};

async function loadBeat(beatId: string): Promise<Beat> {
  // PostgREST rejects a malformed uuid with 22P02, which would surface as an
  // internal error instead of "no such beat".
  if (!isUuid(beatId)) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("id", beatId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  return mapBeatRow(data as BeatRow);
}

async function requireAdminPlatformOps(): Promise<void> {
  await requireRole(["ADMIN"]);
}

/** Viewer access for the admin PLATFORM beats list / detail (ADMIN + `beats.edit`). */
export async function requireAdminPlatformBeatsAccess(): Promise<void> {
  await requireAdminPlatformOps();
  await requirePermission("beats.edit");
}

/** Viewer access for the moderation queue / detail (ADMIN or MODERATOR). */
export async function requireModerationAccess(): Promise<void> {
  await requireRole(["ADMIN", "MODERATOR"]);
}

/**
 * Publish hard gate — READY + same-beat MASTER, then USER object-key binding.
 * Call BEFORE status transition (Wave 4: gate first, then PUBLISHED).
 */
async function assertActiveMasterReadyForPublish(beat: Beat): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_audio_assets")
    .select("id, beat_id, purpose, status, is_active, object_key")
    .eq("beat_id", beat.id);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const assetsForBeat: PublishGateAssetSnapshot[] = rows.map((row) => ({
    id: row.id as string,
    beatId: row.beat_id as string,
    purpose: row.purpose as PublishGateAssetSnapshot["purpose"],
    status: row.status as PublishGateAssetSnapshot["status"],
    isActive: Boolean(row.is_active),
  }));

  const gate = assertPublishHardGate({
    beatId: beat.id,
    ownershipType: beat.ownershipType,
    status: beat.status,
    assetsForBeat,
  });

  if (!gate.ok) {
    throw new AuthError("FORBIDDEN", gate.reason);
  }

  if (beat.ownershipType === "USER") {
    if (!beat.ownerId) {
      throw new AuthError("FORBIDDEN", "USER beat must have an owner.");
    }
    const readyRow = rows.find(
      (row) =>
        row.id === gate.readyMasterAssetId &&
        row.beat_id === beat.id &&
        row.purpose === "MASTER" &&
        row.is_active === true &&
        row.status === "READY",
    );
    if (!readyRow) {
      throw new AuthError(
        "FORBIDDEN",
        "Publish requires an active MASTER READY audio asset.",
      );
    }
    const keyCheck = assertUserBeatObjectKeyBinding({
      objectKey: readyRow.object_key as string,
      ownerId: beat.ownerId,
      beatId: beat.id,
      assetId: readyRow.id as string,
    });
    if (!keyCheck.ok) {
      throw new AuthError("FORBIDDEN", keyCheck.error);
    }
  }
}

/**
 * Wave 3: revalidate active MASTER READY on submit and approve.
 * Do not trust READY from upload time — deny if asset was replaced/invalidated.
 */
async function assertActiveMasterReadyForCommunityTransition(
  beat: Beat,
  actionLabel: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_audio_assets")
    .select("id, beat_id, purpose, status, is_active")
    .eq("beat_id", beat.id);

  if (error) {
    throw new Error(error.message);
  }

  const ready = (data ?? []).some(
    (row) =>
      row.beat_id === beat.id &&
      row.purpose === "MASTER" &&
      row.is_active === true &&
      row.status === "READY",
  );

  if (!ready) {
    throw new AuthError(
      "FORBIDDEN",
      `${actionLabel} requires an active MASTER READY audio asset.`,
    );
  }
}

/**
 * Phase 1.4/1.7: ADMIN creates PLATFORM beats only.
 */
export async function createPlatformBeat(
  input: Omit<BeatInput, "ownershipType" | "ownerId">,
): Promise<Beat> {
  await requireAdminPlatformOps();
  await requirePermission("beats.create");

  const validated = validateBeatInput({
    ...input,
    ownershipType: "PLATFORM",
    ownerId: null,
    status: input.status ?? "DRAFT",
  });
  if (!validated.ok) {
    throw new BeatRequestError(validated.errors.join("; "));
  }

  if (validated.value.status !== "DRAFT") {
    throw new BeatRequestError(
      "New platform beats must start as DRAFT. Publish only after active MASTER READY.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .insert(
      toBeatInsertPayload({
        ...validated.value,
        status: "DRAFT",
        rejectionReason: null,
      }),
    )
    .select(BEAT_SELECT_FULL)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

/**
 * Community Wave 1: authenticated USER creates own USER DRAFT.
 * Forces ownership — never trusts client ownerId / ownershipType / status.
 */
export async function createUserBeat(
  input: Omit<BeatInput, "ownershipType" | "ownerId" | "status">,
): Promise<Beat> {
  const context = await requireUser();
  if (context.profile.role !== "USER") {
    // Staff creating personal community beats is out of Wave 1; use PLATFORM path.
    if (context.profile.role === "ADMIN" || context.profile.role === "MODERATOR") {
      throw new AuthError(
        "FORBIDDEN",
        "createUserBeat is for USER role only. Use PLATFORM admin create for staff.",
      );
    }
  }
  await requirePermission("beats.create");

  const ownerId = context.userId;
  const validated = validateBeatInput({
    ...input,
    ownershipType: "USER",
    ownerId,
    status: "DRAFT",
  });
  if (!validated.ok) {
    throw new BeatRequestError(validated.errors.join("; "));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .insert(
      toBeatInsertPayload({
        ...validated.value,
        ownershipType: "USER",
        ownerId,
        status: "DRAFT",
        rejectionReason: null,
      }),
    )
    .select(BEAT_SELECT_FULL)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

/**
 * Community Wave 2/3: patch metadata of the owner's USER DRAFT / REJECTED beat
 * with the service-role client. The beats trigger skips every check for
 * service_role, so this function is the whole boundary: `ownerId` must be the
 * authenticated user, and ownership, type and status are re-checked here and
 * pinned in the UPDATE. Only metadata columns are written.
 */
export async function patchUserDraftMetadataAfterAuthz(params: {
  beatId: string;
  ownerId: string;
  patch: {
    title?: string;
    producer?: string | null;
    description?: string | null;
    genre?: string | null;
    style?: string | null;
    bpm?: number;
    key?: string | null;
    scale?: string | null;
    durationSeconds?: number;
    tags?: string[];
    coverRef?: string | null;
  };
}): Promise<void> {
  if (!isUuid(params.beatId)) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  const admin = createSupabaseAdminClient();
  const { data: current, error: loadError } = await admin
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("id", params.beatId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!current) throw new AuthError("NOT_FOUND", "Beat not found.");

  const beat = mapBeatRow(current as BeatRow);
  if (
    beat.ownershipType !== "USER" ||
    beat.ownerId !== params.ownerId ||
    (beat.status !== "DRAFT" && beat.status !== "REJECTED")
  ) {
    throw new AuthError("FORBIDDEN", "USER draft metadata patch denied.");
  }

  const nextInput: BeatInput = {
    ownershipType: "USER",
    ownerId: params.ownerId,
    title: params.patch.title ?? beat.title,
    producer:
      params.patch.producer !== undefined ? params.patch.producer : beat.producer,
    description:
      params.patch.description !== undefined
        ? params.patch.description
        : beat.description,
    genre: params.patch.genre !== undefined ? params.patch.genre : beat.genre,
    style: params.patch.style !== undefined ? params.patch.style : beat.style,
    bpm: params.patch.bpm ?? beat.bpm,
    key: params.patch.key !== undefined ? params.patch.key : beat.key,
    scale: params.patch.scale !== undefined ? params.patch.scale : beat.scale,
    durationSeconds: params.patch.durationSeconds ?? beat.durationSeconds,
    tags: params.patch.tags ?? beat.tags,
    coverRef:
      params.patch.coverRef !== undefined ? params.patch.coverRef : beat.coverRef,
    // Status is not written. Validate metadata against the USER draft rules so
    // the create-only "USER beats start as DRAFT" rule does not block REJECTED.
    status: "DRAFT",
  };

  const validated = validateBeatInput(nextInput);
  if (!validated.ok) {
    throw new BeatRequestError(validated.errors.join("; "));
  }

  const { data: updated, error } = await admin
    .from("beats")
    .update(toBeatMetadataPayload(validated.value))
    .eq("id", params.beatId)
    .eq("owner_id", params.ownerId)
    .eq("ownership_type", "USER")
    .eq("status", beat.status)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!updated || updated.length === 0) {
    throw new AuthError(
      "CONFLICT",
      "Beat changed during the metadata update. Reload and try again.",
    );
  }
}

/**
 * Community Wave 2/3: owner may update metadata on own USER DRAFT or REJECTED.
 */
export async function updateOwnUserDraftMetadata(
  beatId: string,
  patch: Partial<Omit<BeatInput, "status" | "ownershipType" | "ownerId">>,
): Promise<Beat> {
  const context = await requireUser();
  await patchUserDraftMetadataAfterAuthz({
    beatId,
    ownerId: context.userId,
    patch,
  });
  return loadBeat(beatId);
}

/** ADMIN metadata edit (not for MODERATOR full edit). */
export async function updateBeatMetadata(
  beatId: string,
  patch: Partial<Omit<BeatInput, "status">> & { uploadDate?: string | null },
): Promise<Beat> {
  const context = await requireRole(["ADMIN"]);
  await requirePermission("beats.edit");

  const current = await loadBeat(beatId);
  if (current.ownershipType !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "Phase 1.7 admin ops only allow PLATFORM beats.",
    );
  }

  const nextInput: BeatInput = {
    ownershipType: "PLATFORM",
    ownerId: null,
    title: patch.title ?? current.title,
    producer: patch.producer !== undefined ? patch.producer : current.producer,
    description:
      patch.description !== undefined ? patch.description : current.description,
    genre: patch.genre !== undefined ? patch.genre : current.genre,
    style: patch.style !== undefined ? patch.style : current.style,
    bpm: patch.bpm ?? current.bpm,
    key: patch.key !== undefined ? patch.key : current.key,
    scale: patch.scale !== undefined ? patch.scale : current.scale,
    durationSeconds: patch.durationSeconds ?? current.durationSeconds,
    tags: patch.tags ?? current.tags,
    coverRef: patch.coverRef !== undefined ? patch.coverRef : current.coverRef,
    status: current.status,
  };

  const validated = validateBeatInput(nextInput);
  if (!validated.ok) {
    throw new BeatRequestError(validated.errors.join("; "));
  }

  const uploadDate = parseUploadDateInput(patch.uploadDate, current.createdAt);
  if (!uploadDate.ok) {
    throw new BeatRequestError(uploadDate.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .update({
      ...toBeatInsertPayload(validated.value),
      ...(uploadDate.iso ? { created_at: uploadDate.iso } : {}),
    })
    .eq("id", beatId)
    .select(BEAT_SELECT_FULL)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const updated = mapBeatRow(data as BeatRow);
  await auditBeatMetadataUpdate(context, current, updated);
  return updated;
}

/**
 * admin_audit_events BEAT_METADATA_UPDATE (service_role insert, like
 * SAMPLE_POLICY_UPDATE). The beat row is already written; an audit failure is
 * logged loudly instead of failing the edit (no shared transaction).
 */
async function auditBeatMetadataUpdate(
  context: Awaited<ReturnType<typeof requireRole>>,
  before: Beat,
  after: Beat,
): Promise<void> {
  const diff = diffBeatMetadataForAudit(before, after);
  if (diff.changed.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .from("admin_audit_events")
    .insert({
      actor_user_id: context.profile.id,
      target_user_id: null,
      actor_user_number: context.profile.userNumber ?? null,
      target_user_number: null,
      action: "BEAT_METADATA_UPDATE",
      old_value: diff.oldValue,
      new_value: diff.newValue,
      metadata: { beatId: after.id, fields: diff.changed },
    });
  if (error) {
    console.error("[beats] admin audit insert failed:", error.message);
  }
}

export async function transitionBeatStatus(
  beatId: string,
  to: BeatStatus,
  options?: { rejectionReason?: string | null; licenseAcknowledged?: boolean },
): Promise<Beat> {
  const context = await requireUser();
  const current = await loadBeat(beatId);
  const actor =
    context.profile.role === "ADMIN"
      ? "ADMIN"
      : context.profile.role === "MODERATOR"
        ? "MODERATOR"
        : "USER";

  const isOwner =
    current.ownershipType === "USER" &&
    current.ownerId === context.userId;

  if (
    !canTransitionStatus({
      from: current.status,
      to,
      actor,
      ownershipType: current.ownershipType,
      isOwner,
    })
  ) {
    throw new AuthError(
      "FORBIDDEN",
      `Status transition ${current.status} → ${to} is not allowed`,
    );
  }

  if (actor === "ADMIN") {
    if (to === "PUBLISHED") {
      await requirePermission("beats.publish");
    } else {
      await requirePermission("beats.edit");
    }
  } else if (actor === "MODERATOR") {
    if (to === "APPROVED") {
      await requirePermission("beats.approve");
    } else if (to === "REJECTED") {
      await requirePermission("beats.reject");
    } else if (to === "PUBLISHED") {
      await requirePermission("beats.publish");
      if (current.ownershipType !== "USER") {
        throw new AuthError(
          "FORBIDDEN",
          "MODERATOR may only publish USER-owned beats.",
        );
      }
    } else {
      throw new AuthError("FORBIDDEN", "Insufficient role.");
    }
  } else {
    // USER — own beat only (already gated by canTransitionStatus + isOwner)
    if (!isOwner) {
      throw new AuthError("FORBIDDEN", "Not beat owner.");
    }
    if (to === "PUBLISHED" || to === "APPROVED") {
      throw new AuthError("FORBIDDEN", "USER cannot approve or publish.");
    }
  }

  if (to === "PUBLISHED") {
    await assertActiveMasterReadyForPublish(current);
    if (current.ownershipType === "PLATFORM") {
      if (!options?.licenseAcknowledged) {
        throw new AuthError(
          "FORBIDDEN",
          "Publikacja platformy wymaga potwierdzenia licencji dla aktualnego Mastera. Sam opis lub referencja nie wystarczą.",
        );
      }
      const { recordPlatformLicense } = await import(
        "@/lib/beats/rights-records"
      );
      await recordPlatformLicense({
        beatId: current.id,
        verifierId: context.userId,
      });
    }
  }

  const patch: Record<string, unknown> = { status: to };

  if (to === "REJECTED") {
    const reason = validateRejectionReason(options?.rejectionReason);
    if (!reason.ok) {
      throw new AuthError("FORBIDDEN", reason.error);
    }
    patch.rejection_reason = reason.value;
  } else if (
    to === "DRAFT" ||
    to === "APPROVED" ||
    to === "PUBLISHED" ||
    to === "PENDING_REVIEW"
  ) {
    patch.rejection_reason = null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .update(patch)
    .eq("id", beatId)
    .select(BEAT_SELECT_FULL)
    .single();

  if (error) {
    const { rightsDatabaseMessage } = await import("@/lib/beats/rights-policy");
    const rightsMessage = rightsDatabaseMessage(error.message);
    if (rightsMessage) {
      throw new AuthError("FORBIDDEN", rightsMessage);
    }
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

/** Community Wave 3/5: DRAFT → PENDING_REVIEW (own + MASTER READY + submit cooldown). */
export async function submitUserBeat(
  beatId: string,
  options?: { rightsAccepted?: boolean },
): Promise<Beat> {
  const context = await requireUser();
  await requirePermission("beats.create");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "submitUserBeat is for USER beats.");
  }
  if (current.ownerId !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not beat owner.");
  }
  if (current.status !== "DRAFT") {
    throw new AuthError(
      "FORBIDDEN",
      `Submit requires DRAFT (current: ${current.status}).`,
    );
  }
  const cooldown = assertSubmitCooldown({
    lastSubmittedAt: current.lastSubmittedAt,
  });
  if (!cooldown.ok) {
    throw new AuthError("FORBIDDEN", cooldown.error);
  }
  await assertActiveMasterReadyForCommunityTransition(current, "Submit");
  if (!current.ownerId) {
    throw new AuthError(
      "FORBIDDEN",
      "Nie można złożyć oświadczenia za usunięte konto właściciela.",
    );
  }
  if (!options?.rightsAccepted) {
    throw new AuthError(
      "FORBIDDEN",
      "Zaznacz oświadczenie o prawach do nagrania i sampli.",
    );
  }
  const { prepareUserSubmissionRights } = await import(
    "@/lib/beats/rights-records"
  );
  await prepareUserSubmissionRights({
    beatId: current.id,
    ownerId: current.ownerId,
  });
  const { recordRecognitionReview } = await import("@/lib/beats/rights-records");
  const { localRecognitionResult } = await import(
    "@/lib/beats/rights-recognition"
  );
  await recordRecognitionReview({
    beatId: current.id,
    actorId: context.userId,
    result: localRecognitionResult(),
  });
  const submitted = await transitionBeatStatus(beatId, "PENDING_REVIEW");
  // Upload filter: the beat waits in PENDING_REVIEW with a pending auto check.
  // Approve/Publish are blocked (DB gate + service assert) until it passes.
  const { enqueueBeatAutoCheck } = await import("@/lib/beats/auto-check/records");
  await enqueueBeatAutoCheck(submitted.id);
  return submitted;
}

export async function approveUserBeat(beatId: string): Promise<Beat> {
  const context = await requireUser();
  await requirePermission("beats.approve");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "approveUserBeat is for USER beats.");
  }
  if (!current.ownerId) {
    throw new AuthError("FORBIDDEN", "USER beat must have an owner.");
  }
  if (!staffMayModerateBeat(context.userId, current.ownerId)) {
    throw new AuthError("FORBIDDEN", "Staff cannot moderate their own beat.");
  }
  if (current.status !== "PENDING_REVIEW") {
    throw new AuthError(
      "FORBIDDEN",
      `Approve requires PENDING_REVIEW (current: ${current.status}).`,
    );
  }
  await assertActiveMasterReadyForCommunityTransition(current, "Approve");
  const { assertBeatAutoCheckCleared } = await import("@/lib/beats/auto-check/records");
  await assertBeatAutoCheckCleared(current.id);
  const approved = await transitionBeatStatus(beatId, "APPROVED");
  if (approved.ownerId !== current.ownerId) {
    throw new AuthError("FORBIDDEN", "Owner changed during approve.");
  }
  const { hookBeatApproved } = await import(
    "@/lib/creator-progress/award-hooks"
  );
  await hookBeatApproved({
    ownerUserId: approved.ownerId,
    beatId: approved.id,
  });
  return approved;
}

export async function rejectUserBeat(
  beatId: string,
  rejectionReason: string,
): Promise<Beat> {
  const context = await requireUser();
  await requirePermission("beats.reject");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "rejectUserBeat is for USER beats.");
  }
  if (!current.ownerId) {
    throw new AuthError("FORBIDDEN", "USER beat must have an owner.");
  }
  if (!staffMayModerateBeat(context.userId, current.ownerId)) {
    throw new AuthError("FORBIDDEN", "Staff cannot moderate their own beat.");
  }
  if (current.status !== "PENDING_REVIEW") {
    throw new AuthError(
      "FORBIDDEN",
      `Reject requires PENDING_REVIEW (current: ${current.status}).`,
    );
  }
  return transitionBeatStatus(beatId, "REJECTED", { rejectionReason });
}

/**
 * Community Wave 4: APPROVED USER → PUBLISHED (ADMIN | MODERATOR + beats.publish).
 * Thin wrapper: AuthZ → READY hard gate → transition only (no metadata patch).
 */
export async function publishApprovedUserBeat(beatId: string): Promise<Beat> {
  await requirePermission("beats.publish");
  const context = await requireUser();
  if (
    context.profile.role !== "ADMIN" &&
    context.profile.role !== "MODERATOR"
  ) {
    throw new AuthError("FORBIDDEN", "Only staff may publish community beats.");
  }

  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError(
      "FORBIDDEN",
      "publishApprovedUserBeat is for USER beats.",
    );
  }
  if (!current.ownerId) {
    throw new AuthError("FORBIDDEN", "USER beat must have an owner.");
  }
  if (!staffMayModerateBeat(context.userId, current.ownerId)) {
    throw new AuthError("FORBIDDEN", "Staff cannot moderate their own beat.");
  }
  if (current.status !== "APPROVED") {
    throw new AuthError(
      "FORBIDDEN",
      `Publish requires APPROVED (current: ${current.status}).`,
    );
  }

  await assertActiveMasterReadyForPublish(current);
  {
    const { assertBeatAutoCheckCleared } = await import("@/lib/beats/auto-check/records");
    await assertBeatAutoCheckCleared(current.id);
  }
  const { loadUserPublishRightsFacts } = await import(
    "@/lib/beats/rights-records"
  );
  const facts = await loadUserPublishRightsFacts(current.id);
  const decision = evaluateUserPublishRights({
    beatId: current.id,
    status: current.status,
    masterReady: true,
    attestation: facts.attestation,
    currentChecksum: facts.checksum ?? "",
    statementVersion: USER_RIGHTS_STATEMENT_VERSION,
    check: facts.openManualReview
      ? { kind: "not_run" }
      : { kind: "no_signal" },
    openManualReview: facts.openManualReview,
    hashBlocked: facts.hashBlocked,
    ownerId: current.ownerId,
    latestClosedOutcome: facts.latestClosedOutcome,
  });
  if (!decision.ok) {
    throw new AuthError(
      "FORBIDDEN",
      "Publikacja nie spełnia kontroli praw dla aktualnego Mastera. Brak oświadczenia, blokada, otwarta lub nierozwiązana sprawa albo brak właściciela zatrzymują publikację.",
    );
  }

  const published = await transitionBeatStatus(beatId, "PUBLISHED");
  if (published.ownerId !== current.ownerId) {
    throw new AuthError("FORBIDDEN", "Owner changed during publish.");
  }
  if (published.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "Ownership type changed during publish.");
  }
  const { hookBeatFirstPublished } = await import(
    "@/lib/creator-progress/award-hooks"
  );
  await hookBeatFirstPublished({
    ownerUserId: published.ownerId,
    beatId: published.id,
  });
  return published;
}

export async function archiveOwnUserBeat(beatId: string): Promise<Beat> {
  const context = await requireUser();
  const current = await loadBeat(beatId);
  if (
    current.ownershipType !== "USER" ||
    current.ownerId !== context.userId
  ) {
    throw new AuthError("FORBIDDEN", "Not beat owner.");
  }
  return transitionBeatStatus(beatId, "ARCHIVED");
}

/** Return USER beat to DRAFT after REJECTED (clears rejection_reason). */
export async function returnRejectedUserBeatToDraft(
  beatId: string,
): Promise<Beat> {
  const context = await requireUser();
  const current = await loadBeat(beatId);
  if (
    current.ownershipType !== "USER" ||
    current.ownerId !== context.userId
  ) {
    throw new AuthError("FORBIDDEN", "Not beat owner.");
  }
  if (current.status !== "REJECTED") {
    throw new AuthError("FORBIDDEN", "Beat must be REJECTED to return to DRAFT.");
  }
  return transitionBeatStatus(beatId, "DRAFT");
}

export async function archiveBeat(beatId: string): Promise<Beat> {
  return transitionBeatStatus(beatId, "ARCHIVED");
}

export async function deleteBeat(beatId: string): Promise<void> {
  await requireAdminPlatformOps();
  await requirePermission("beats.delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("beats").delete().eq("id", beatId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listPublishedBeats(): Promise<Beat[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_PUBLIC)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map(mapPublicBeatRow) ?? [];
  return withPublicAuthors(beats);
}

export async function getPublishedBeat(beatId: string): Promise<Beat | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_PUBLIC)
    .eq("id", beatId)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  const beat = mapPublicBeatRow(data as BeatRow);
  const [enriched] = await withPublicAuthors([beat]);
  return enriched ?? beat;
}

export async function listPlatformBeatsForAdmin(): Promise<
  PlatformBeatAdminListItem[]
> {
  await requireAdminPlatformBeatsAccess();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("ownership_type", "PLATFORM")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map((row) => mapBeatRow(row)) ?? [];
  if (beats.length === 0) {
    return [];
  }

  const ids = beats.map((b) => b.id);
  const { data: assets, error: assetError } = await supabase
    .from("beat_audio_assets")
    .select("beat_id, purpose, status, is_active")
    .in("beat_id", ids)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY");

  if (assetError) {
    throw new Error(assetError.message);
  }

  const ready = new Set((assets ?? []).map((row) => row.beat_id as string));

  return beats.map((beat) => ({
    ...beat,
    activeMasterReady: ready.has(beat.id),
  }));
}

export type AdminBeatCatalogueItem = PlatformBeatAdminListItem & {
  downloadCount: number;
};

export type AdminBeatCataloguePage = {
  rows: AdminBeatCatalogueItem[];
  total: number;
  page: number;
  pageCount: number;
};

/** Paginated, server-sorted PLATFORM catalogue for /admin/beats. */
export async function listPlatformBeatCatalogueForAdmin(
  query: AdminBeatsQuery,
): Promise<AdminBeatCataloguePage> {
  await requireAdminPlatformBeatsAccess();

  const supabase = await createSupabaseServerClient();
  const column = ADMIN_BEATS_SORT_COLUMNS[query.sort];
  const run = async (page: number) => {
    const { from, to } = adminBeatsRange(page, query.size);
    let q = supabase
      .from("beats")
      .select(BEAT_SELECT_FULL, { count: "exact" })
      .eq("ownership_type", "PLATFORM");
    if (query.status) q = q.eq("status", query.status);
    if (query.q) {
      const pattern = `"*${query.q}*"`;
      q = q.or(`title.ilike.${pattern},producer.ilike.${pattern}`);
    }
    return q
      .order(column, { ascending: query.dir === "asc", nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
  };

  let page = query.page;
  let res = await run(page);
  if (res.error) throw new Error(res.error.message);
  const total = res.count ?? 0;
  const pageCount = adminBeatsPageCount(total, query.size);
  if (page > pageCount) {
    page = pageCount;
    res = await run(page);
    if (res.error) throw new Error(res.error.message);
  }

  const beats = ((res.data as BeatRow[] | null) ?? []).map((row) => mapBeatRow(row));
  if (beats.length === 0) return { rows: [], total, page, pageCount };

  const ids = beats.map((b) => b.id);
  const { data: assets, error: assetError } = await supabase
    .from("beat_audio_assets")
    .select("beat_id")
    .in("beat_id", ids)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY");
  if (assetError) throw new Error(assetError.message);
  const ready = new Set((assets ?? []).map((row) => row.beat_id as string));

  // beat_download_events is select-own under RLS; counts need service_role
  // (caller is already verified ADMIN + beats.edit above).
  const downloads = new Map<string, number>();
  const { data: events, error: eventsError } = await createSupabaseAdminClient()
    .from("beat_download_events")
    .select("beat_id")
    .in("beat_id", ids);
  if (eventsError) {
    console.error("[beats] admin download counts failed:", eventsError.message);
  } else {
    for (const row of events ?? []) {
      const id = row.beat_id as string;
      downloads.set(id, (downloads.get(id) ?? 0) + 1);
    }
  }

  return {
    rows: beats.map((beat) => ({
      ...beat,
      activeMasterReady: ready.has(beat.id),
      downloadCount: downloads.get(beat.id) ?? 0,
    })),
    total,
    page,
    pageCount,
  };
}

export async function getPlatformBeatForAdmin(beatId: string): Promise<Beat> {
  await requireAdminPlatformBeatsAccess();

  const beat = await loadBeat(beatId);
  if (beat.ownershipType !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "Phase 1.7 admin ops only allow PLATFORM beats.",
    );
  }
  return beat;
}

export type OwnUserBeatListItem = Beat & {
  activeMasterReady: boolean;
};

export type ModerationQueueItem = Beat & {
  activeMasterReady: boolean;
  openRightsReviews?: Array<{
    id: string;
    kind: string;
    checksumSha256: string;
  }>;
};

async function attachActiveMasterReady(
  beats: Beat[],
): Promise<Array<Beat & { activeMasterReady: boolean }>> {
  if (beats.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const ids = beats.map((b) => b.id);
  const { data: assets, error: assetError } = await supabase
    .from("beat_audio_assets")
    .select("beat_id, purpose, status, is_active")
    .in("beat_id", ids)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY");

  if (assetError) {
    throw new Error(assetError.message);
  }

  const ready = new Set((assets ?? []).map((row) => row.beat_id as string));
  return beats.map((beat) => ({
    ...beat,
    activeMasterReady: ready.has(beat.id),
  }));
}

/** Community Wave 3: owner list of own USER beats (all statuses). */
export async function listOwnUserBeats(): Promise<OwnUserBeatListItem[]> {
  const context = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("ownership_type", "USER")
    .eq("owner_id", context.userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map((row) => mapBeatRow(row)) ?? [];
  return attachActiveMasterReady(beats);
}

export async function getOwnUserBeat(beatId: string): Promise<OwnUserBeatListItem> {
  const context = await requireUser();
  const beat = await loadBeat(beatId);
  if (
    beat.ownershipType !== "USER" ||
    beat.ownerId !== context.userId
  ) {
    throw new AuthError("FORBIDDEN", "Not beat owner.");
  }
  const [withReady] = await attachActiveMasterReady([beat]);
  return withReady!;
}

/**
 * Community Wave 3: PENDING_REVIEW queue for ADMIN + MODERATOR.
 * Does not include APPROVED / PUBLISHED / DRAFT.
 */
export async function listPendingReviewForModeration(): Promise<
  ModerationQueueItem[]
> {
  await requireModerationAccess();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("status", "PENDING_REVIEW")
    .eq("ownership_type", "USER")
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map((row) => mapBeatRow(row)) ?? [];
  return attachActiveMasterReady(beats);
}

/**
 * Community Wave 4: APPROVED USER beats awaiting staff publish.
 */
export async function listApprovedForModeration(): Promise<
  ModerationQueueItem[]
> {
  await requireModerationAccess();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("status", "APPROVED")
    .eq("ownership_type", "USER")
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map((row) => mapBeatRow(row)) ?? [];
  return attachActiveMasterReady(beats);
}

export async function getPendingReviewBeatForModeration(
  beatId: string,
): Promise<ModerationQueueItem> {
  return getStaffCommunityBeatForModeration(beatId, ["PENDING_REVIEW"]);
}

/**
 * Staff detail for PENDING_REVIEW (approve/reject) or APPROVED (publish).
 */
export async function getStaffCommunityBeatForModeration(
  beatId: string,
  allowedStatuses: readonly ("PENDING_REVIEW" | "APPROVED")[] = [
    "PENDING_REVIEW",
    "APPROVED",
  ],
): Promise<ModerationQueueItem> {
  await requireModerationAccess();
  const beat = await loadBeat(beatId);
  if (beat.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "Moderation is for USER beats.");
  }
  if (!allowedStatuses.includes(beat.status as "PENDING_REVIEW" | "APPROVED")) {
    // Upload filter: auto-rejected (not yet overridden) beats stay reviewable for override.
    const autoRejected =
      beat.status === "REJECTED" && (await isAwaitingAutoCheckOverride(beat.id));
    if (!autoRejected) {
      throw new AuthError(
        "FORBIDDEN",
        `Moderation detail is only for ${allowedStatuses.join(" / ")} (current: ${beat.status}).`,
      );
    }
  }
  const [withReady] = await attachActiveMasterReady([beat]);
  const { listOpenRightsReviews } = await import("@/lib/beats/rights-records");
  const openRightsReviews = await listOpenRightsReviews(beat.id);
  return { ...withReady!, openRightsReviews };
}

async function isAwaitingAutoCheckOverride(beatId: string): Promise<boolean> {
  const { loadLatestAutoChecks } = await import("@/lib/beats/auto-check/records");
  const latest = (await loadLatestAutoChecks([beatId])).get(beatId);
  return Boolean(
    latest &&
      (latest.status === "rejected_vocals" || latest.status === "rejected_match") &&
      !latest.overridden_at,
  );
}

/** Upload filter: REJECTED USER beats whose latest auto check rejected and is not overridden. */
export async function listAutoRejectedForModeration(): Promise<ModerationQueueItem[]> {
  await requireModerationAccess();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_FULL)
    .eq("status", "REJECTED")
    .eq("ownership_type", "USER")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(error.message);
  }
  const beats = (data as BeatRow[] | null)?.map((row) => mapBeatRow(row)) ?? [];
  if (beats.length === 0) return [];
  const { loadLatestAutoChecks } = await import("@/lib/beats/auto-check/records");
  const checks = await loadLatestAutoChecks(beats.map((b) => b.id));
  const filtered = beats.filter((b) => {
    const c = checks.get(b.id);
    return c && (c.status === "rejected_vocals" || c.status === "rejected_match") && !c.overridden_at;
  });
  return attachActiveMasterReady(filtered);
}

/** Moderator override of an auto-reject (logged in beat_moderation_decisions). */
export async function overrideBeatAutoCheckForModeration(
  beatId: string,
  reason: string,
): Promise<void> {
  const context = await requireRole(["ADMIN", "MODERATOR"]);
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    throw new AuthError("FORBIDDEN", "Podaj uzasadnienie (min. 5 znaków).");
  }
  const beat = await loadBeat(beatId);
  if (beat.ownerId === context.userId) {
    throw new AuthError("FORBIDDEN", "Nie można uchylić odrzucenia własnego bitu.");
  }
  const { loadLatestAutoChecks, overrideBeatAutoCheck } = await import(
    "@/lib/beats/auto-check/records"
  );
  const latest = (await loadLatestAutoChecks([beatId])).get(beatId);
  if (!latest || !(latest.status === "rejected_vocals" || latest.status === "rejected_match") || latest.overridden_at) {
    throw new AuthError("FORBIDDEN", "Brak automatycznego odrzucenia do uchylenia.");
  }
  await overrideBeatAutoCheck({ checkId: latest.id, actorId: context.userId, reason: trimmed });
}

/** Staff: re-run the filter after an error (new check for the current master). */
export async function retryBeatAutoCheckForModeration(beatId: string): Promise<void> {
  await requireModerationAccess();
  const beat = await loadBeat(beatId);
  if (beat.status !== "PENDING_REVIEW") {
    throw new AuthError("FORBIDDEN", "Ponowne sprawdzenie tylko dla bitów w moderacji.");
  }
  const { enqueueBeatAutoCheck } = await import("@/lib/beats/auto-check/records");
  await enqueueBeatAutoCheck(beatId);
}

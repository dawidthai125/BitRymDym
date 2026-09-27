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
  canTransitionStatus,
  validateBeatInput,
  validateRejectionReason,
  type BeatInput,
} from "@/lib/beats/validation";
import {
  BEAT_SELECT_FULL,
  BEAT_SELECT_PUBLIC,
  mapBeatRow,
  mapPublicBeatRow,
  toBeatInsertPayload,
  type BeatRow,
} from "@/lib/beats/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformBeatAdminListItem = Beat & {
  activeMasterReady: boolean;
};

async function loadBeat(beatId: string): Promise<Beat> {
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

async function assertActiveMasterReadyForPublish(beat: Beat): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_audio_assets")
    .select("id, beat_id, purpose, status, is_active")
    .eq("beat_id", beat.id);

  if (error) {
    throw new Error(error.message);
  }

  const assetsForBeat: PublishGateAssetSnapshot[] = (data ?? []).map((row) => ({
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
}

/**
 * Wave 1 contract: submit requires active MASTER READY (same truth as publish).
 * Wave 2 transport will create the READY asset before submit is usable end-to-end.
 */
async function assertActiveMasterReadyForSubmit(beat: Beat): Promise<void> {
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
      "Submit requires an active MASTER READY audio asset.",
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
    throw new Error(validated.errors.join("; "));
  }

  if (validated.value.status !== "DRAFT") {
    throw new Error(
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
    throw new Error(validated.errors.join("; "));
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

/** ADMIN metadata edit (not for MODERATOR full edit). */
export async function updateBeatMetadata(
  beatId: string,
  patch: Partial<Omit<BeatInput, "status">>,
): Promise<Beat> {
  await requireAdminPlatformOps();
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
    throw new Error(validated.errors.join("; "));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .update(toBeatInsertPayload(validated.value))
    .eq("id", beatId)
    .select(BEAT_SELECT_FULL)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

export async function transitionBeatStatus(
  beatId: string,
  to: BeatStatus,
  options?: { rejectionReason?: string | null },
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
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

/** Community: DRAFT → PENDING_REVIEW (own + MASTER READY). */
export async function submitUserBeat(beatId: string): Promise<Beat> {
  const context = await requireUser();
  const current = await loadBeat(beatId);
  if (
    current.ownershipType !== "USER" ||
    current.ownerId !== context.userId
  ) {
    throw new AuthError("FORBIDDEN", "Not beat owner.");
  }
  if (current.status === "PENDING_REVIEW") {
    throw new AuthError("FORBIDDEN", "Beat is already pending review.");
  }
  await assertActiveMasterReadyForSubmit(current);
  return transitionBeatStatus(beatId, "PENDING_REVIEW");
}

export async function approveUserBeat(beatId: string): Promise<Beat> {
  await requirePermission("beats.approve");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "approveUserBeat is for USER beats.");
  }
  return transitionBeatStatus(beatId, "APPROVED");
}

export async function rejectUserBeat(
  beatId: string,
  rejectionReason: string,
): Promise<Beat> {
  await requirePermission("beats.reject");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError("FORBIDDEN", "rejectUserBeat is for USER beats.");
  }
  return transitionBeatStatus(beatId, "REJECTED", { rejectionReason });
}

export async function publishApprovedUserBeat(beatId: string): Promise<Beat> {
  await requirePermission("beats.publish");
  const current = await loadBeat(beatId);
  if (current.ownershipType !== "USER") {
    throw new AuthError(
      "FORBIDDEN",
      "publishApprovedUserBeat is for USER beats.",
    );
  }
  if (current.status !== "APPROVED") {
    throw new AuthError("FORBIDDEN", "Beat must be APPROVED before publish.");
  }
  return transitionBeatStatus(beatId, "PUBLISHED");
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

  return (data as BeatRow[] | null)?.map(mapPublicBeatRow) ?? [];
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
  return mapPublicBeatRow(data as BeatRow);
}

export async function listPlatformBeatsForAdmin(): Promise<
  PlatformBeatAdminListItem[]
> {
  await requireAdminPlatformOps();
  await requirePermission("beats.edit");

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

export async function getPlatformBeatForAdmin(beatId: string): Promise<Beat> {
  await requireAdminPlatformOps();
  await requirePermission("beats.edit");

  const beat = await loadBeat(beatId);
  if (beat.ownershipType !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "Phase 1.7 admin ops only allow PLATFORM beats.",
    );
  }
  return beat;
}

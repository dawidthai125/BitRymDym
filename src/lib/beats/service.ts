import "server-only";

import type { Beat, BeatStatus } from "@/types/domain";
import {
  AuthError,
  requirePermission,
  requireRole,
  requireUser,
} from "@/lib/auth/session";
import {
  assertPlatformPublishHardGate,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import {
  canTransitionStatus,
  validateBeatInput,
  type BeatInput,
} from "@/lib/beats/validation";
import {
  mapBeatRow,
  toBeatInsertPayload,
  type BeatRow,
} from "@/lib/beats/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BEAT_SELECT =
  "id, owner_id, ownership_type, title, producer, description, genre, style, bpm, key, scale, duration_seconds, tags, cover_ref, status, created_at, updated_at";

export type PlatformBeatAdminListItem = Beat & {
  activeMasterReady: boolean;
};

async function loadBeat(beatId: string): Promise<Beat> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT)
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

/**
 * Phase 1.4: ADMIN creates PLATFORM beats only.
 * USER community create is OUT OF SCOPE.
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

  // Publish requires READY MASTER (server hard gate). Create always starts DRAFT.
  if (validated.value.status !== "DRAFT") {
    throw new Error(
      "New platform beats must start as DRAFT. Publish only after active MASTER READY.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .insert(toBeatInsertPayload({ ...validated.value, status: "DRAFT" }))
    .select(BEAT_SELECT)
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

  // Ownership is immutable via metadata edit (PLATFORM + owner_id NULL).
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
    .select(BEAT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

export async function transitionBeatStatus(
  beatId: string,
  to: BeatStatus,
): Promise<Beat> {
  const context = await requireUser();
  const current = await loadBeat(beatId);
  const actor =
    context.profile.role === "ADMIN"
      ? "ADMIN"
      : context.profile.role === "MODERATOR"
        ? "MODERATOR"
        : "USER";

  if (!canTransitionStatus({ from: current.status, to, actor })) {
    throw new AuthError(
      "FORBIDDEN",
      `Status transition ${current.status} → ${to} is not allowed`,
    );
  }

  if (actor === "ADMIN") {
    await requirePermission("beats.edit");
  } else if (actor === "MODERATOR") {
    await requirePermission(to === "APPROVED" ? "beats.approve" : "beats.reject");
  } else {
    throw new AuthError("FORBIDDEN", "Insufficient role.");
  }

  if (to === "PUBLISHED") {
    await assertActiveMasterReadyForPublish(current);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .update({ status: to })
    .eq("id", beatId)
    .select(BEAT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBeatRow(data as BeatRow);
}

/**
 * Server hard gate (GAP-PUBLISH-READY CLOSED):
 * DRAFT → PUBLISHED only with PLATFORM + active MASTER READY for this beat.
 * Never trust client `ready` flags.
 */
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

  const gate = assertPlatformPublishHardGate({
    beatId: beat.id,
    ownershipType: beat.ownershipType,
    status: beat.status,
    assetsForBeat,
  });

  if (!gate.ok) {
    throw new AuthError("FORBIDDEN", gate.reason);
  }
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
    .select(BEAT_SELECT)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as BeatRow[] | null)?.map(mapBeatRow) ?? [];
}

/**
 * Public surface only — PUBLISHED beats.
 * Staff RLS may expose non-published rows; this gate keeps /beat/[id] public-only.
 */
export async function getPublishedBeat(beatId: string): Promise<Beat | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT)
    .eq("id", beatId)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return mapBeatRow(data as BeatRow);
}

/** Phase 1.7 — ADMIN PLATFORM ops list (staff RLS + ADMIN gate). */
export async function listPlatformBeatsForAdmin(): Promise<
  PlatformBeatAdminListItem[]
> {
  await requireAdminPlatformOps();
  await requirePermission("beats.edit");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT)
    .eq("ownership_type", "PLATFORM")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const beats = (data as BeatRow[] | null)?.map(mapBeatRow) ?? [];
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

/** Phase 1.7 — ADMIN PLATFORM beat detail. */
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

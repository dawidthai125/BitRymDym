/**
 * Recording Wave 5 — beat access grant server domain (service_role only).
 */

import "server-only";

import {
  MAX_ACTIVE_BEAT_ACCESS_GRANTS,
  isBeatAccessGrantActive,
  type BeatRecordAccessSource,
} from "@/config/beat-access-grants";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rejectGrantClientPrivilegeFields } from "@/lib/grants/grant-input";

export { rejectGrantClientPrivilegeFields };

export type BeatAccessGrantRow = {
  id: string;
  beat_id: string;
  grantee_user_id: string;
  granted_by: string;
  can_record: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  updated_at: string;
};

export type OwnerGrantListItem = {
  id: string;
  beatId: string;
  granteeUserId: string;
  granteeDisplayName: string | null;
  canRecord: true;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  revokedAt: string | null;
};

export type GranteeGrantListItem = {
  id: string;
  beatId: string;
  beatTitle: string;
  canRecord: true;
  createdAt: string;
  expiresAt: string | null;
};

function mapCreateRpcError(message: string): never {
  if (message.includes("SELF_GRANT")) {
    throw new AuthError("FORBIDDEN", "Cannot grant access to yourself.");
  }
  if (message.includes("PLATFORM_BEAT")) {
    throw new AuthError(
      "FORBIDDEN",
      "Grants are only allowed on USER-owned beats.",
    );
  }
  if (message.includes("NOT_BEAT_OWNER")) {
    throw new AuthError("FORBIDDEN", "Only the beat owner may create grants.");
  }
  if (message.includes("BEAT_NOT_PUBLISHED")) {
    throw new AuthError(
      "FORBIDDEN",
      "Grants are only allowed on PUBLISHED beats.",
    );
  }
  if (message.includes("BEAT_NOT_FOUND")) {
    throw new AuthError("NOT_FOUND", "Beat not found.");
  }
  if (message.includes("GRANTEE_NOT_FOUND")) {
    throw new AuthError("NOT_FOUND", "Grantee user not found.");
  }
  if (message.includes("ACTIVE_GRANT_EXISTS")) {
    throw new AuthError("CONFLICT", "An active grant already exists for this user.");
  }
  if (message.includes("ACTIVE_GRANT_CAP")) {
    throw new AuthError(
      "FORBIDDEN",
      `Active grant limit (${MAX_ACTIVE_BEAT_ACCESS_GRANTS}) reached for this beat.`,
    );
  }
  if (message.includes("INVALID_EXPIRY")) {
    throw new AuthError("FORBIDDEN", "expiresAt must be in the future.");
  }
  throw new Error(message);
}

async function loadOwnedUserBeatOrThrow(params: {
  beatId: string;
  ownerId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select("id, owner_id, ownership_type, status, title")
    .eq("id", params.beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");
  if (data.ownership_type !== "USER" || data.owner_id == null) {
    throw new AuthError(
      "FORBIDDEN",
      "Grants are only allowed on USER-owned beats.",
    );
  }
  if (data.owner_id !== params.ownerId) {
    throw new AuthError("FORBIDDEN", "Only the beat owner may manage grants.");
  }
  return data;
}

export async function hasActiveRecordGrant(params: {
  beatId: string;
  granteeUserId: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_access_grants")
    .select("id, revoked_at, expires_at, can_record")
    .eq("beat_id", params.beatId)
    .eq("grantee_user_id", params.granteeUserId)
    .is("revoked_at", null)
    .eq("can_record", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return isBeatAccessGrantActive({
    revokedAt: data.revoked_at,
    expiresAt: data.expires_at,
  });
}

export async function resolveRecordAccessSource(params: {
  beatId: string;
  granteeUserId: string;
}): Promise<BeatRecordAccessSource> {
  const hasGrant = await hasActiveRecordGrant(params);
  return hasGrant ? "GRANT_RECORD" : "PUBLIC_PUBLISHED";
}

export async function createBeatAccessGrantFor(
  context: AuthContext,
  params: {
    beatId: string;
    granteeUserId: string;
    expiresAt?: string | null;
  },
): Promise<{ grantId: string }> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  }

  // App-layer AuthZ (RPC re-checks ownership / PUBLISHED / caps).
  await loadOwnedUserBeatOrThrow({
    beatId: params.beatId,
    ownerId: context.userId,
  });

  if (params.granteeUserId === context.userId) {
    throw new AuthError("FORBIDDEN", "Cannot grant access to yourself.");
  }

  let expiresAt: string | null = null;
  if (params.expiresAt != null && params.expiresAt !== "") {
    const ms = Date.parse(params.expiresAt);
    if (Number.isNaN(ms) || ms <= Date.now()) {
      throw new AuthError("FORBIDDEN", "expiresAt must be a future ISO timestamp.");
    }
    expiresAt = new Date(ms).toISOString();
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_beat_access_grant", {
    p_beat_id: params.beatId,
    p_grantee_user_id: params.granteeUserId,
    p_granted_by: context.userId,
    p_expires_at: expiresAt,
    p_max_active: MAX_ACTIVE_BEAT_ACCESS_GRANTS,
  });

  if (error) {
    mapCreateRpcError(error.message);
  }

  return { grantId: data as string };
}

export async function listOwnerBeatAccessGrantsFor(
  context: AuthContext,
  beatId: string,
): Promise<OwnerGrantListItem[]> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  }
  await loadOwnedUserBeatOrThrow({ beatId, ownerId: context.userId });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_access_grants")
    .select(
      "id, beat_id, grantee_user_id, created_at, expires_at, revoked_at, can_record",
    )
    .eq("beat_id", beatId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const granteeIds = [...new Set(rows.map((r) => r.grantee_user_id as string))];
  const nameById = new Map<string, string | null>();
  if (granteeIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", granteeIds);
    if (pErr) throw new Error(pErr.message);
    for (const p of profiles ?? []) {
      nameById.set(p.id as string, (p.display_name as string | null) ?? null);
    }
  }

  return rows.map((r) => ({
    id: r.id as string,
    beatId: r.beat_id as string,
    granteeUserId: r.grantee_user_id as string,
    granteeDisplayName: nameById.get(r.grantee_user_id as string) ?? null,
    canRecord: true as const,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    active: isBeatAccessGrantActive({
      revokedAt: (r.revoked_at as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
    }),
  }));
}

export async function revokeBeatAccessGrantFor(
  context: AuthContext,
  params: { beatId: string; grantId: string },
): Promise<void> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  }
  await loadOwnedUserBeatOrThrow({
    beatId: params.beatId,
    ownerId: context.userId,
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_access_grants")
    .select("id, beat_id, revoked_at")
    .eq("id", params.grantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.beat_id !== params.beatId) {
    throw new AuthError("NOT_FOUND", "Grant not found.");
  }
  if (data.revoked_at != null) {
    return;
  }

  const { error: updErr } = await admin
    .from("beat_access_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.grantId)
    .eq("beat_id", params.beatId)
    .is("revoked_at", null);
  if (updErr) throw new Error(updErr.message);
}

export async function listActiveGranteeGrantsFor(
  context: AuthContext,
): Promise<GranteeGrantListItem[]> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Authentication required.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_access_grants")
    .select("id, beat_id, created_at, expires_at, revoked_at, can_record")
    .eq("grantee_user_id", context.userId)
    .is("revoked_at", null)
    .eq("can_record", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const active = (data ?? []).filter((r) =>
    isBeatAccessGrantActive({
      revokedAt: (r.revoked_at as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
    }),
  );
  if (active.length === 0) return [];

  const beatIds = [...new Set(active.map((r) => r.beat_id as string))];
  const { data: beats, error: bErr } = await admin
    .from("beats")
    .select("id, title, status")
    .in("id", beatIds);
  if (bErr) throw new Error(bErr.message);
  const titleById = new Map(
    (beats ?? []).map((b) => [b.id as string, b.title as string]),
  );

  return active.map((r) => ({
    id: r.id as string,
    beatId: r.beat_id as string,
    beatTitle: titleById.get(r.beat_id as string) ?? "Bit",
    canRecord: true as const,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
  }));
}

/** Resolve grantee by UUID or exact display_name (owner UX). */
export async function resolveGranteeUserId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new AuthError("NOT_FOUND", "Grantee user not found.");
  }

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const admin = createSupabaseAdminClient();

  if (uuidRe.test(trimmed)) {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AuthError("NOT_FOUND", "Grantee user not found.");
    return data.id as string;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("display_name", trimmed)
    .limit(2);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new AuthError("NOT_FOUND", "Grantee user not found.");
  }
  if (data.length > 1) {
    throw new AuthError(
      "FORBIDDEN",
      "Display name is ambiguous; use the user UUID.",
    );
  }
  return data[0].id as string;
}

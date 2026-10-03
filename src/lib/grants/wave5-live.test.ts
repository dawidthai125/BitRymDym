/**
 * Live — Recording Wave 5 Shared Grants → RECORD.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { MAX_ACTIVE_BEAT_ACCESS_GRANTS } from "@/config/beat-access-grants";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  BEAT_AUDIO_BUCKET,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";
import {
  createBeatAccessGrantFor,
  hasActiveRecordGrant,
  listActiveGranteeGrantsFor,
  listOwnerBeatAccessGrantsFor,
  revokeBeatAccessGrantFor,
} from "@/lib/grants/beat-access-grants";
import { createTakeRecordingSessionFor } from "@/lib/takes/take-transport";

function readEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]!] = val;
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const fixturePath = resolve(
  process.cwd(),
  "../bitrymdym-fixtures/bpm-120-steady.wav",
);
const live = Boolean(url && serviceKey && anonKey && existsSync(fixturePath));

if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
if (anonKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;

function userContext(userId: string, email: string): AuthContext {
  return {
    userId,
    email,
    profile: {
      id: userId,
      displayName: "Wave5",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

async function makeUser(admin: SupabaseClient, label: string) {
  const email = `wave5-grant-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave5Grant-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const userId = data.user!.id;
  await admin.from("profiles").upsert({
    id: userId,
    role: "USER",
    account_level: "BEGINNER_RAPPER",
    display_name: `w5-${label}-${randomUUID().slice(0, 6)}`,
  });
  return { userId, email, context: userContext(userId, email) };
}

async function makePublishedUserBeat(
  admin: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
) {
  const beatId = randomUUID();
  const { error: beatErr } = await admin.from("beats").insert({
    id: beatId,
    owner_id: ownerId,
    ownership_type: "USER",
    title: `W5 Grant ${beatId.slice(0, 8)}`,
    bpm: 120,
    duration_seconds: 30,
    status: "PUBLISHED",
  });
  expect(beatErr).toBeNull();

  // OD-KEY-06: seed canonical USER keys only (no new legacy writers).
  const assetId = randomUUID();
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: "MASTER",
  });
  const { error: upErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, bytes, {
      contentType: "audio/wav",
      upsert: false,
    });
  expect(upErr).toBeNull();

  const { error: assetErr } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: beatId,
    purpose: "MASTER",
    status: "READY",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: "audio/wav",
    byte_size: bytes.length,
    is_active: true,
    created_by: ownerId,
  });
  expect(assetErr).toBeNull();

  return beatId;
}

describe.runIf(live)("Recording Wave 5 — live grants", () => {
  it("create / list / revoke / self-deny / foreign-deny / session still works", async () => {
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bytes = readFileSync(fixturePath);
    const owner = await makeUser(admin, "owner");
    const grantee = await makeUser(admin, "grantee");
    const stranger = await makeUser(admin, "stranger");
    const beatId = await makePublishedUserBeat(admin, owner.userId, bytes);

    await expect(
      createBeatAccessGrantFor(owner.context, {
        beatId,
        granteeUserId: owner.userId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const created = await createBeatAccessGrantFor(owner.context, {
      beatId,
      granteeUserId: grantee.userId,
    });
    expect(created.grantId).toBeTruthy();

    await expect(
      createBeatAccessGrantFor(owner.context, {
        beatId,
        granteeUserId: grantee.userId,
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const ownerList = await listOwnerBeatAccessGrantsFor(owner.context, beatId);
    expect(ownerList.some((g) => g.id === created.grantId && g.active)).toBe(
      true,
    );

    await expect(
      listOwnerBeatAccessGrantsFor(stranger.context, beatId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const granteeList = await listActiveGranteeGrantsFor(grantee.context);
    expect(granteeList.some((g) => g.beatId === beatId)).toBe(true);

    expect(
      await hasActiveRecordGrant({
        beatId,
        granteeUserId: grantee.userId,
      }),
    ).toBe(true);

    const session = await createTakeRecordingSessionFor(grantee.context, {
      beatId,
      contentType: "audio/webm",
      byteSize: 2048,
    });
    expect(session.takeId).toBeTruthy();

    await revokeBeatAccessGrantFor(owner.context, {
      beatId,
      grantId: created.grantId,
    });

    expect(
      await hasActiveRecordGrant({
        beatId,
        granteeUserId: grantee.userId,
      }),
    ).toBe(false);

    // Public PUBLISHED RECORD still ALLOW without grant (W4 parity).
    const session2 = await createTakeRecordingSessionFor(stranger.context, {
      beatId,
      contentType: "audio/webm",
      byteSize: 2048,
    });
    expect(session2.takeId).toBeTruthy();

    // Cap smoke: fill toward limit is expensive; assert constant + one extra
    // create still works after revoke (slot free).
    const again = await createBeatAccessGrantFor(owner.context, {
      beatId,
      granteeUserId: grantee.userId,
    });
    expect(again.grantId).not.toBe(created.grantId);
    expect(MAX_ACTIVE_BEAT_ACCESS_GRANTS).toBe(20);

    await admin.from("takes").delete().eq("beat_id", beatId);
    await admin.from("beat_access_grants").delete().eq("beat_id", beatId);
    await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
    await admin.from("beats").delete().eq("id", beatId);
    await admin.auth.admin.deleteUser(owner.userId);
    await admin.auth.admin.deleteUser(grantee.userId);
    await admin.auth.admin.deleteUser(stranger.userId);
  }, 120_000);

  it("expired unrevoked grant is soft-revoked on re-create", async () => {
    const admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bytes = readFileSync(fixturePath);
    const owner = await makeUser(admin, "exp-owner");
    const grantee = await makeUser(admin, "exp-grantee");
    const beatId = await makePublishedUserBeat(admin, owner.userId, bytes);

    const past = new Date(Date.now() - 60_000).toISOString();
    const futureCreate = new Date(Date.now() + 3_600_000).toISOString();

    // Insert expired-but-unrevoked row directly (bypass create RPC expiry check).
    const { data: expiredRow, error: insErr } = await admin
      .from("beat_access_grants")
      .insert({
        beat_id: beatId,
        grantee_user_id: grantee.userId,
        granted_by: owner.userId,
        can_record: true,
        created_at: new Date(Date.now() - 120_000).toISOString(),
        expires_at: past,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();

    const recreated = await createBeatAccessGrantFor(owner.context, {
      beatId,
      granteeUserId: grantee.userId,
      expiresAt: futureCreate,
    });
    expect(recreated.grantId).toBeTruthy();

    const { data: old } = await admin
      .from("beat_access_grants")
      .select("revoked_at")
      .eq("id", expiredRow!.id)
      .single();
    expect(old?.revoked_at).toBeTruthy();

    await admin.from("beat_access_grants").delete().eq("beat_id", beatId);
    await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
    await admin.from("beats").delete().eq("id", beatId);
    await admin.auth.admin.deleteUser(owner.userId);
    await admin.auth.admin.deleteUser(grantee.userId);
  }, 120_000);
});

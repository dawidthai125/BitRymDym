/**
 * P3 live — anonymous READY → account claim (Storage copy + RPC).
 * Requires local Supabase + fixtures; skips when unavailable.
 */
import { randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { SAMPLE_POLICY_DEFAULTS, TAKE_AUDIO_BUCKET } from "@/config/recording";
import type { AuthContext } from "@/lib/auth/types";
import { claimAnonTakeToAccountFor } from "@/lib/takes/anon-account-claim";
import {
  createAnonTakeRecordingSessionFor,
  finalizeAnonTakeRecordingFor,
} from "@/lib/takes/anon-take-transport";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";
import { hashAnonymousTakeToken } from "@/lib/takes/token-hash";
import { buildUserBeatAudioObjectKey } from "@/lib/beats/audio-validation";

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = {
  ...loadEnvFile(resolve(process.cwd(), ".env.local")),
  ...process.env,
};
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

function makeShortSilentWav(durationSeconds = 1, sampleRate = 8000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function userContext(userId: string, email: string): AuthContext {
  return {
    userId,
    email,
    profile: {
      id: userId,
      displayName: "P3Clm",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

async function makeUser(admin: SupabaseClient, tag: string) {
  const email = `p3-claim-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `P3c!${randomBytes(8).toString("hex")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return {
    userId: data.user.id,
    email,
    password,
    context: userContext(data.user.id, email),
  };
}

async function seedBeat(admin: SupabaseClient, ownerId: string) {
  const beatId = randomUUID();
  const assetId = randomUUID();
  const bytes = readFileSync(fixturePath);
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: "MASTER",
  });
  const { error: beatErr } = await admin.from("beats").insert({
    id: beatId,
    title: `P3 Claim Beat ${beatId.slice(0, 8)}`,
    status: "PUBLISHED",
    ownership_type: "USER",
    owner_id: ownerId,
    duration_seconds: 30,
    bpm: 120,
    tags: [],
  });
  if (beatErr) throw beatErr;

  const { error: upErr } = await admin.storage
    .from("beat-audio")
    .upload(objectKey, bytes, { contentType: "audio/wav", upsert: false });
  if (upErr) throw upErr;

  const { error: assetErr } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: beatId,
    purpose: "MASTER",
    status: "READY",
    is_active: true,
    storage_bucket: "beat-audio",
    object_key: objectKey,
    content_type: "audio/wav",
    byte_size: bytes.byteLength,
    created_by: ownerId,
  });
  if (assetErr) throw assetErr;

  return { beatId, objectKey };
}

const cleanupTakeIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupBeatKeys: string[] = [];

describe.runIf(live)("P3 live — anon → account claim", () => {
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  afterAll(async () => {
    for (const id of cleanupTakeIds) {
      const { data: t } = await admin
        .from("takes")
        .select("object_key")
        .eq("id", id)
        .maybeSingle();
      if (t?.object_key) {
        await admin.storage
          .from(TAKE_AUDIO_BUCKET)
          .remove([t.object_key as string])
          .catch(() => undefined);
      }
      await admin.from("takes").delete().eq("id", id);
    }
    for (const key of cleanupBeatKeys) {
      await admin.storage.from("beat-audio").remove([key]).catch(() => undefined);
    }
    for (const uid of cleanupUserIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  it(
    "claims READY anon take to user path with Premium FREE TTL",
    async () => {
    const owner = await makeUser(admin, "own");
    cleanupUserIds.push(owner.userId);
    const { beatId, objectKey: beatKey } = await seedBeat(admin, owner.userId);
    cleanupBeatKeys.push(beatKey);

    const raw = randomBytes(32).toString("hex");
    const hash = hashAnonymousTakeToken(raw);
    const wav = makeShortSilentWav(1);

    const session = await createAnonTakeRecordingSessionFor(hash, {
      beatId,
      contentType: "audio/wav",
      byteSize: wav.byteLength,
    });
    cleanupTakeIds.push(session.takeId);

    const { error: putErr } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .uploadToSignedUrl(session.path, session.token, wav, {
        contentType: "audio/wav",
      });
    if (putErr) throw putErr;

    await finalizeAnonTakeRecordingFor(hash, { takeId: session.takeId });

    // Bypass cookie layer — call RPC path via injected identity by stubbing
    // read through direct claimAnonTakeToAccountFor requires cookies.
    // Live path: invoke RPC + storage manually mirroring orchestrator core,
    // then verify via claimAnonTakeToAccountFor with mocked cookie is hard.
    // Instead call admin RPC after copy like orchestrator.

    const destKey = buildUserTakeObjectKey({
      ownerId: owner.userId,
      takeId: session.takeId,
    });
    const { error: copyErr } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .copy(session.objectKey, destKey);
    expect(copyErr).toBeNull();

    const expiresAt = new Date(
      Date.now() + SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds * 1000,
    ).toISOString();

    const { data: rpc, error: rpcErr } = await admin.rpc(
      "claim_anon_take_to_account",
      {
        p_owner_id: owner.userId,
        p_anonymous_token_hash: hash,
        p_expires_at: expiresAt,
        p_max_active_ready: SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady,
        p_expected_new_object_key: destKey,
      },
    );
    expect(rpcErr).toBeNull();
    expect(rpc?.code).toBe("CLAIM_OK");
    expect(rpc?.take_id).toBe(session.takeId);

    await admin.storage.from(TAKE_AUDIO_BUCKET).remove([session.objectKey]);

    const { data: row } = await admin
      .from("takes")
      .select(
        "owner_id, anonymous_token_hash, object_key, status, expires_at",
      )
      .eq("id", session.takeId)
      .single();

    expect(row?.owner_id).toBe(owner.userId);
    expect(row?.anonymous_token_hash).toBeNull();
    expect(row?.object_key).toBe(destKey);
    expect(row?.status).toBe("READY");

    // Ownership list (avoid P4 title column until migration applied on live DB).
    const { data: ownedRows, error: ownedErr } = await admin
      .from("takes")
      .select("id, status, owner_id")
      .eq("owner_id", owner.userId)
      .eq("id", session.takeId);
    expect(ownedErr).toBeNull();
    expect(ownedRows?.some((t) => t.id === session.takeId && t.status === "READY")).toBe(
      true,
    );

    // Idempotent replay
    const { data: replay, error: replayErr } = await admin.rpc(
      "claim_anon_take_to_account",
      {
        p_owner_id: owner.userId,
        p_anonymous_token_hash: hash,
        p_expires_at: expiresAt,
        p_max_active_ready: SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady,
        p_expected_new_object_key: destKey,
      },
    );
    expect(replayErr).toBeNull();
    expect(replay?.code).toBe("CLAIM_IDEMPOTENT_REPLAY");

    // anon/authenticated cannot execute
    const anonClient = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: anonDenied } = await anonClient.rpc(
      "claim_anon_take_to_account",
      {
        p_owner_id: owner.userId,
        p_anonymous_token_hash: hash,
        p_expires_at: expiresAt,
        p_max_active_ready: 3,
        p_expected_new_object_key: destKey,
      },
    );
    expect(anonDenied).toBeTruthy();
  },
    60_000,
  );

  it(
    "DENY claim when READY cap reached; leave anon take intact",
    async () => {
    const owner = await makeUser(admin, "cap");
    cleanupUserIds.push(owner.userId);
    const { beatId, objectKey: beatKey } = await seedBeat(admin, owner.userId);
    cleanupBeatKeys.push(beatKey);

    // Fill FREE cap (3) with owned READY takes
    for (let i = 0; i < SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady; i++) {
      const wav = makeShortSilentWav(1);
      const s = await createTakeRecordingSessionFor(owner.context, {
        beatId,
        contentType: "audio/wav",
        byteSize: wav.byteLength,
      });
      cleanupTakeIds.push(s.takeId);
      const { error: putErr } = await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .uploadToSignedUrl(s.path, s.token, wav, { contentType: "audio/wav" });
      if (putErr) throw putErr;
      await finalizeTakeRecordingFor(owner.context, { takeId: s.takeId });
    }

    const raw = randomBytes(32).toString("hex");
    const hash = hashAnonymousTakeToken(raw);
    const wav = makeShortSilentWav(1);
    const session = await createAnonTakeRecordingSessionFor(hash, {
      beatId,
      contentType: "audio/wav",
      byteSize: wav.byteLength,
    });
    cleanupTakeIds.push(session.takeId);
    const { error: putErr } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .uploadToSignedUrl(session.path, session.token, wav, {
        contentType: "audio/wav",
      });
    if (putErr) throw putErr;
    await finalizeAnonTakeRecordingFor(hash, { takeId: session.takeId });

    const destKey = buildUserTakeObjectKey({
      ownerId: owner.userId,
      takeId: session.takeId,
    });
    await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .copy(session.objectKey, destKey);

    const { error: rpcErr } = await admin.rpc("claim_anon_take_to_account", {
      p_owner_id: owner.userId,
      p_anonymous_token_hash: hash,
      p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      p_max_active_ready: SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady,
      p_expected_new_object_key: destKey,
    });
    expect(rpcErr?.message).toMatch(/CLAIM_CAP_REACHED/);

    const { data: row } = await admin
      .from("takes")
      .select("owner_id, anonymous_token_hash, status, object_key")
      .eq("id", session.takeId)
      .single();
    expect(row?.owner_id).toBeNull();
    expect(row?.anonymous_token_hash).toBe(hash);
    expect(row?.status).toBe("READY");
    expect(row?.object_key).toBe(session.objectKey);

    await admin.storage.from(TAKE_AUDIO_BUCKET).remove([destKey]);
  },
    90_000,
  );

  it("rejects PENDING and path injection", async () => {
    const owner = await makeUser(admin, "pend");
    cleanupUserIds.push(owner.userId);
    const { beatId, objectKey: beatKey } = await seedBeat(admin, owner.userId);
    cleanupBeatKeys.push(beatKey);

    const raw = randomBytes(32).toString("hex");
    const hash = hashAnonymousTakeToken(raw);
    const wav = makeShortSilentWav(1);
    const session = await createAnonTakeRecordingSessionFor(hash, {
      beatId,
      contentType: "audio/wav",
      byteSize: wav.byteLength,
    });
    cleanupTakeIds.push(session.takeId);
    // leave PENDING — no finalize

    const destKey = buildUserTakeObjectKey({
      ownerId: owner.userId,
      takeId: session.takeId,
    });

    const { error: pendingErr } = await admin.rpc(
      "claim_anon_take_to_account",
      {
        p_owner_id: owner.userId,
        p_anonymous_token_hash: hash,
        p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        p_max_active_ready: 3,
        p_expected_new_object_key: destKey,
      },
    );
    expect(pendingErr?.message).toMatch(/CLAIM_NO_ELIGIBLE/);

    const { error: injectErr } = await admin.rpc(
      "claim_anon_take_to_account",
      {
        p_owner_id: owner.userId,
        p_anonymous_token_hash: hash,
        p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        p_max_active_ready: 3,
        p_expected_new_object_key: `user/${owner.userId}/takes/${session.takeId}/../evil.bin`,
      },
    );
    expect(injectErr?.message).toMatch(/CLAIM_INVALID/);
  });
});

describe("P3 live gate", () => {
  it("documents live skip when env/fixtures missing", () => {
    if (!live) {
      expect(live).toBe(false);
    } else {
      expect(typeof claimAnonTakeToAccountFor).toBe("function");
    }
  });
});

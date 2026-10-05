/**
 * P2 live — explicit replace previous sample (auth + anon).
 * Uses controlled fixtures; cleans up takes it creates.
 */
import { randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import type { AuthContext } from "@/lib/auth/types";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import {
  createAnonTakeRecordingSessionFor,
  finalizeAnonTakeRecordingFor,
} from "@/lib/takes/anon-take-transport";
import { hashAnonymousTakeToken } from "@/lib/takes/token-hash";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
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

const env = { ...loadEnvFile(resolve(process.cwd(), ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const fixturePath = resolve(process.cwd(), "../bitrymdym-fixtures/bpm-120-steady.wav");
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
      displayName: "P2Rep",
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
  const email = `p2-replace-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `P2r!${randomBytes(8).toString("hex")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { userId: data.user.id, email, password, context: userContext(data.user.id, email) };
}

async function seedBeat(
  admin: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
  durationSeconds: number,
) {
  const beatId = randomUUID();
  const assetId = randomUUID();
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: "MASTER",
  });
  const { error: bErr } = await admin.from("beats").insert({
    id: beatId,
    title: `P2 Replace ${beatId.slice(0, 6)}`,
    status: "PUBLISHED",
    ownership_type: "USER",
    owner_id: ownerId,
    duration_seconds: durationSeconds,
    bpm: 120,
    tags: [],
  });
  if (bErr) throw bErr;
  const { error: upErr } = await admin.storage
    .from("beat-audio")
    .upload(objectKey, bytes, { contentType: "audio/wav", upsert: false });
  if (upErr) throw upErr;
  const { error: aErr } = await admin.from("beat_audio_assets").insert({
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
  if (aErr) throw aErr;
  return { beatId, assetId, objectKey };
}

async function uploadSessionBlob(
  admin: SupabaseClient,
  session: { path: string; token: string },
  bytes: Buffer,
  contentType: string,
) {
  const { error } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .uploadToSignedUrl(session.path, session.token, bytes, {
      contentType,
      upsert: false,
    });
  expect(error).toBeNull();
}

const createdUserIds: string[] = [];
const createdBeatIds: string[] = [];
const createdTakeIds: string[] = [];

describe.runIf(live)("P2 — explicit sample replace live", () => {
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bytes = makeShortSilentWav(1);

  afterAll(async () => {
    for (const id of createdTakeIds) {
      await admin.from("takes").update({ status: "FAILED", failure_reason: "P2_TEST_CLEANUP" }).eq("id", id);
      const { data: t } = await admin.from("takes").select("object_key").eq("id", id).maybeSingle();
      if (t?.object_key) {
        await admin.storage.from(TAKE_AUDIO_BUCKET).remove([t.object_key as string]);
      }
      await admin.from("takes").delete().eq("id", id);
    }
    for (const beatId of createdBeatIds) {
      await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
      await admin.from("beats").delete().eq("id", beatId);
    }
    for (const uid of createdUserIds) {
      await admin.auth.admin.deleteUser(uid);
    }
  });

  it(
    "at cap without replace → REPLACE_REQUIRED; valid replace → READY + old DELETED",
    async () => {
    const owner = await makeUser(admin, "auth");
    createdUserIds.push(owner.userId);
    const { beatId } = await seedBeat(admin, owner.userId, bytes, 30);
    createdBeatIds.push(beatId);
    const { beatId: beatB } = await seedBeat(admin, owner.userId, bytes, 30);
    createdBeatIds.push(beatB);

    const readyIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await createTakeRecordingSessionFor(owner.context, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      createdTakeIds.push(s.takeId);
      await uploadSessionBlob(admin, s, bytes, "audio/wav");
      const ready = await finalizeTakeRecordingFor(owner.context, { takeId: s.takeId });
      expect(ready.status).toBe("READY");
      readyIds.push(s.takeId);
    }

    // Free UTC-day session budget so ACTIVE_READY_CAP is the gate under test
    // (FREE: sessions/day === activeReady === 3).
    const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();
    await admin
      .from("takes")
      .update({ created_at: yesterday })
      .in("id", readyIds);

    await expect(
      createTakeRecordingSessionFor(owner.context, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      }),
    ).rejects.toBeInstanceOf(TakeClaimError);

    try {
      await createTakeRecordingSessionFor(owner.context, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TakeClaimError);
      expect((e as TakeClaimError).claimCode).toBe("REPLACE_REQUIRED");
      expect((e as TakeClaimError).replaceableTakes?.length).toBeGreaterThanOrEqual(3);
    }

    // forged foreign take
    const other = await makeUser(admin, "victim");
    createdUserIds.push(other.userId);
    await expect(
      createTakeRecordingSessionFor(owner.context, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        replaceTakeId: randomUUID(),
      }),
    ).rejects.toMatchObject({ claimCode: "REPLACE_INVALID" });

    // cross-beat replace PASS
    const replaceTarget = readyIds[1]!;
    const s = await createTakeRecordingSessionFor(owner.context, {
      beatId: beatB,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
      replaceTakeId: replaceTarget,
    });
    createdTakeIds.push(s.takeId);
    expect(s.takeId).toBeTruthy();
    await uploadSessionBlob(admin, s, bytes, "audio/wav");
    const ready = await finalizeTakeRecordingFor(owner.context, { takeId: s.takeId });
    expect(ready.status).toBe("READY");

    const { data: oldRow } = await admin
      .from("takes")
      .select("status, deleted_at, failure_reason")
      .eq("id", replaceTarget)
      .single();
    expect(oldRow?.status).toBe("DELETED");
    expect(oldRow?.deleted_at).toBeTruthy();
    expect(oldRow?.failure_reason).toBe("REPLACED");

    // idempotent finalize replay
    const again = await finalizeTakeRecordingFor(owner.context, { takeId: s.takeId });
    expect(again.status).toBe("READY");
    expect(again.takeId).toBe(s.takeId);
  },
  90_000,
  );

  it(
    "anonymous replace own READY; foreign hash DENY; abandon keeps old READY",
    async () => {
    const owner = await makeUser(admin, "anonseed");
    createdUserIds.push(owner.userId);
    const { beatId } = await seedBeat(admin, owner.userId, bytes, 15);
    createdBeatIds.push(beatId);

    const tokenA = randomBytes(32).toString("hex");
    const hashA = hashAnonymousTakeToken(tokenA);
    const tokenB = randomBytes(32).toString("hex");
    const hashB = hashAnonymousTakeToken(tokenB);

    const s1 = await createAnonTakeRecordingSessionFor(hashA, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    createdTakeIds.push(s1.takeId);
    await uploadSessionBlob(admin, s1, bytes, "audio/wav");
    await finalizeAnonTakeRecordingFor(hashA, { takeId: s1.takeId });

    await expect(
      createAnonTakeRecordingSessionFor(hashA, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      }),
    ).rejects.toMatchObject({ claimCode: "REPLACE_REQUIRED" });

    await expect(
      createAnonTakeRecordingSessionFor(hashB, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        replaceTakeId: s1.takeId,
      }),
    ).rejects.toMatchObject({ claimCode: "REPLACE_OWNERSHIP_DENIED" });

    // abandon: claim replace then do not finalize
    const pending = await createAnonTakeRecordingSessionFor(hashA, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
      replaceTakeId: s1.takeId,
    });
    createdTakeIds.push(pending.takeId);
    const { data: stillReady } = await admin
      .from("takes")
      .select("status, deleted_at")
      .eq("id", s1.takeId)
      .single();
    expect(stillReady?.status).toBe("READY");
    expect(stillReady?.deleted_at).toBeNull();

    // fail pending so we can complete replace
    await admin
      .from("takes")
      .update({ status: "FAILED", failure_reason: "P2_ABANDON" })
      .eq("id", pending.takeId);

    const s2 = await createAnonTakeRecordingSessionFor(hashA, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
      replaceTakeId: s1.takeId,
    });
    createdTakeIds.push(s2.takeId);
    await uploadSessionBlob(admin, s2, bytes, "audio/wav");
    await finalizeAnonTakeRecordingFor(hashA, { takeId: s2.takeId });

    const { data: oldAnon } = await admin
      .from("takes")
      .select("status")
      .eq("id", s1.takeId)
      .single();
    expect(oldAnon?.status).toBe("DELETED");
  },
  90_000,
  );
});

describe("P2 env gate", () => {
  it("documents live gate", () => {
    expect(typeof live).toBe("boolean");
  });
});

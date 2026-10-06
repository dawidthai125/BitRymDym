/**
 * Live E2E — Recording D02 Anonymous Quick Take.
 * Caps / concurrency / IDOR / expiry / PUBLISHED-only / no grant dependency.
 */
import { randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  BEAT_AUDIO_BUCKET,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";
import {
  createAnonTakePreviewSignedUrlFor,
} from "@/lib/takes/anon-take-preview";
import {
  createAnonTakeRecordingSessionFor,
  finalizeAnonTakeRecordingFor,
} from "@/lib/takes/anon-take-transport";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { createOwnTakePreviewSignedUrlFor } from "@/lib/takes/take-preview";
import { hashAnonymousTakeToken } from "@/lib/takes/token-hash";

/**
 * Force a take past TTL for live tests.
 * Must keep expires_at > created_at (takes_expires_after_created_chk)
 * while expires_at < now() so ACTIVE_READY count frees the slot.
 * Same pattern as wave4-live / D02 finalize-after-expiry test.
 */
async function forceExpireTakeForLiveTest(
  admin: SupabaseClient,
  takeId: string,
): Promise<void> {
  const createdPast = new Date(Date.now() - 3_600_000).toISOString();
  const expiresPast = new Date(Date.now() - 1_800_000).toISOString();
  const { error, data } = await admin
    .from("takes")
    .update({ created_at: createdPast, expires_at: expiresPast })
    .eq("id", takeId)
    .select("id, expires_at, status");
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(new Date(data![0]!.expires_at as string).getTime()).toBeLessThan(
    Date.now(),
  );
}

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

function freshHash() {
  return hashAnonymousTakeToken(randomBytes(32).toString("hex"));
}

/** ~1s mono PCM WAV — under ANONYMOUS 15s Sample Policy max. */
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
      displayName: "D02Rec",
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

async function makeUser(admin: SupabaseClient, label: string) {
  const email = `d02-rec-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `D02Rec-${randomUUID()}`;
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
    display_name: label,
  });
  return { userId, email, context: userContext(userId, email) };
}

async function seedPublishedBeatWithMaster(
  admin: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
  opts?: { status?: string; durationSeconds?: number },
) {
  const beatId = randomUUID();
  const assetId = randomUUID();
  // OD-KEY-06: seed canonical USER keys only (no new legacy writers).
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: "MASTER",
  });
  expect(
    (
      await admin.from("beats").insert({
        id: beatId,
        ownership_type: "USER",
        owner_id: ownerId,
        title: "D02 recording target",
        bpm: 120,
        duration_seconds: opts?.durationSeconds ?? 30,
        status: opts?.status ?? "PUBLISHED",
        tags: [],
      })
    ).error,
  ).toBeNull();

  const { error: upErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, bytes, {
      contentType: "audio/wav",
      upsert: false,
    });
  expect(upErr).toBeNull();

  expect(
    (
      await admin.from("beat_audio_assets").insert({
        id: assetId,
        beat_id: beatId,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: BEAT_AUDIO_BUCKET,
        object_key: objectKey,
        content_type: "audio/wav",
        byte_size: bytes.byteLength,
        is_active: true,
        created_by: ownerId,
      })
    ).error,
  ).toBeNull();

  return { beatId, assetId, objectKey };
}

async function uploadSessionBlob(
  admin: SupabaseClient,
  session: { objectKey: string; path: string; token: string },
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

describe.runIf(live)("Recording D02 — live anonymous QT", () => {
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Short WAV under ANONYMOUS 15s max (fixture steady wav is ~30s).
  const bytes = makeShortSilentWav(1);

  it("happy path session → upload → finalize → preview; replay finalize idempotent", async () => {
    const owner = await makeUser(admin, "seed");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const tokenHash = freshHash();

    const session = await createAnonTakeRecordingSessionFor(tokenHash, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    expect(session.objectKey.startsWith("anon/")).toBe(true);
    expect(session.maxRecordingSeconds).toBe(15);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await uploadSessionBlob(admin, session, bytes, "audio/wav");
    const ready = await finalizeAnonTakeRecordingFor(tokenHash, {
      takeId: session.takeId,
    });
    expect(ready.status).toBe("READY");

    const again = await finalizeAnonTakeRecordingFor(tokenHash, {
      takeId: session.takeId,
    });
    expect(again.takeId).toBe(ready.takeId);

    const preview = await createAnonTakePreviewSignedUrlFor(tokenHash, {
      takeId: session.takeId,
    });
    expect(preview.url).toMatch(/^https?:\/\//);
    expect(preview.expiresAt).toBeTruthy();
  }, 120_000);

  it("IDOR: token mismatch / cross-take / owner preview DENY; no download module", async () => {
    const owner = await makeUser(admin, "idor");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const hashA = freshHash();
    const hashB = freshHash();
    const session = await createAnonTakeRecordingSessionFor(hashA, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    await uploadSessionBlob(admin, session, bytes, "audio/wav");
    await finalizeAnonTakeRecordingFor(hashA, { takeId: session.takeId });

    await expect(
      finalizeAnonTakeRecordingFor(hashB, { takeId: session.takeId }),
    ).rejects.toBeInstanceOf(AuthError);

    await expect(
      createAnonTakePreviewSignedUrlFor(hashB, { takeId: session.takeId }),
    ).rejects.toBeInstanceOf(AuthError);

    await expect(
      createOwnTakePreviewSignedUrlFor(owner.context, {
        takeId: session.takeId,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  }, 120_000);

  it("PUBLISHED-only: DRAFT beat DENY; non-READY master DENY path via missing asset", async () => {
    const owner = await makeUser(admin, "draft");
    const beatId = randomUUID();
    expect(
      (
        await admin.from("beats").insert({
          id: beatId,
          ownership_type: "USER",
          owner_id: owner.userId,
          title: "D02 draft",
          bpm: 120,
          duration_seconds: 30,
          status: "DRAFT",
          tags: [],
        })
      ).error,
    ).toBeNull();

    await expect(
      createAnonTakeRecordingSessionFor(freshHash(), {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  }, 60_000);

  it("finalize after expiry DENY; preview after expiry DENY", async () => {
    const owner = await makeUser(admin, "exp");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const tokenHash = freshHash();
    const session = await createAnonTakeRecordingSessionFor(tokenHash, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    await uploadSessionBlob(admin, session, bytes, "audio/wav");

    const createdPast = new Date(Date.now() - 3_600_000).toISOString();
    const expireAt = new Date(Date.now() - 1_800_000).toISOString();
    const { error: expErr, data: expRows } = await admin
      .from("takes")
      .update({ created_at: createdPast, expires_at: expireAt })
      .eq("id", session.takeId)
      .eq("status", "PENDING_UPLOAD")
      .select("id, expires_at, status");
    expect(expErr).toBeNull();
    expect(expRows).toHaveLength(1);
    expect(new Date(expRows![0]!.expires_at).getTime()).toBeLessThan(Date.now());

    await expect(
      finalizeAnonTakeRecordingFor(tokenHash, { takeId: session.takeId }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/expired/i) });

    // Force READY then expire for preview DENY
    const session2 = await createAnonTakeRecordingSessionFor(tokenHash, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    await uploadSessionBlob(admin, session2, bytes, "audio/wav");
    await finalizeAnonTakeRecordingFor(tokenHash, { takeId: session2.takeId });
    const { error: exp2Err, data: exp2Rows } = await admin
      .from("takes")
      .update({ created_at: createdPast, expires_at: expireAt })
      .eq("id", session2.takeId)
      .select("id, expires_at");
    expect(exp2Err).toBeNull();
    expect(exp2Rows).toHaveLength(1);

    await expect(
      createAnonTakePreviewSignedUrlFor(tokenHash, {
        takeId: session2.takeId,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/expired/i) });
  }, 120_000);

  it("concurrent PENDING race → one ALLOW one CONCURRENT_SESSION", async () => {
    const owner = await makeUser(admin, "race");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const tokenHash = freshHash();

    const results = await Promise.allSettled([
      createAnonTakeRecordingSessionFor(tokenHash, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      }),
      createAnonTakeRecordingSessionFor(tokenHash, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(1);
    const reason = (fail[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(TakeClaimError);
    expect((reason as TakeClaimError).claimCode).toBe("CONCURRENT_SESSION");

    // cleanup pending so later caps tests aren't polluted for same hash — new hash used below
    const takeId = (ok[0] as PromiseFulfilledResult<{ takeId: string }>).value
      .takeId;
    await admin
      .from("takes")
      .update({ status: "FAILED", failure_reason: "TEST_CLEANUP" })
      .eq("id", takeId);
  }, 120_000);

  it("READY cap race (maxActiveReady=1) and 3/day cap", async () => {
    const owner = await makeUser(admin, "caps");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const tokenHash = freshHash();

    async function makeReady() {
      const s = await createAnonTakeRecordingSessionFor(tokenHash, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      await uploadSessionBlob(admin, s, bytes, "audio/wav");
      return finalizeAnonTakeRecordingFor(tokenHash, { takeId: s.takeId });
    }

    await makeReady();

    await expect(makeReady()).rejects.toMatchObject({
      claimCode: "REPLACE_REQUIRED",
    });

    // Expire READY (respect takes_expires_after_created_chk) so day-cap burn can continue
    const { data: readyRows } = await admin
      .from("takes")
      .select("id")
      .eq("anonymous_token_hash", tokenHash)
      .eq("status", "READY");
    expect(readyRows?.length).toBeGreaterThan(0);
    for (const row of readyRows ?? []) {
      await forceExpireTakeForLiveTest(admin, row.id as string);
    }

    // Sessions today already include failed/expired claims — burn remaining until day cap
    let dayCapHit = false;
    for (let i = 0; i < 5; i++) {
      try {
        const s = await createAnonTakeRecordingSessionFor(tokenHash, {
          beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        const { error: burnErr } = await admin
          .from("takes")
          .update({ status: "FAILED", failure_reason: "TEST_BURN" })
          .eq("id", s.takeId);
        expect(burnErr).toBeNull();
      } catch (e) {
        expect(e).toBeInstanceOf(TakeClaimError);
        expect((e as TakeClaimError).claimCode).toBe("SESSION_DAY_CAP");
        dayCapHit = true;
        break;
      }
    }
    expect(dayCapHit).toBe(true);
  }, 180_000);

  it("authenticated RECORD regression still works (W4 path untouched)", async () => {
    const owner = await makeUser(admin, "authreg");
    const { beatId } = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, { durationSeconds: 15 },
    );
    const session = await createTakeRecordingSessionFor(owner.context, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    expect(session.objectKey.startsWith("user/")).toBe(true);
    await uploadSessionBlob(admin, session, bytes, "audio/wav");
    const ready = await finalizeTakeRecordingFor(owner.context, {
      takeId: session.takeId,
    });
    expect(ready.status).toBe("READY");
  }, 120_000);

  it("client-chosen storage params rejected; cross-beat hash cannot steal other take", async () => {
    const owner = await makeUser(admin, "steal");
    const a = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, {
      durationSeconds: 15,
    });
    const b = await seedPublishedBeatWithMaster(admin, owner.userId, bytes, {
      durationSeconds: 15,
    });
    const hash = freshHash();

    await expect(
      createAnonTakeRecordingSessionFor(hash, {
        beatId: a.beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        objectKey: "anon/evil/takes/x/mic.bin",
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const s1 = await createAnonTakeRecordingSessionFor(hash, {
      beatId: a.beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    await uploadSessionBlob(admin, s1, bytes, "audio/wav");
    await finalizeAnonTakeRecordingFor(hash, { takeId: s1.takeId });

    // Expire READY to free cap (respect takes_expires_after_created_chk), then create on beat B
    await forceExpireTakeForLiveTest(admin, s1.takeId);

    const s2 = await createAnonTakeRecordingSessionFor(hash, {
      beatId: b.beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    expect(s2.beatId).toBe(b.beatId);
    await expect(
      createAnonTakePreviewSignedUrlFor(hash, { takeId: s1.takeId }),
    ).rejects.toBeInstanceOf(AuthError);
  }, 180_000);
});

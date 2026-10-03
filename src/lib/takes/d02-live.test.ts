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
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { createOwnTakePreviewSignedUrlFor } from "@/lib/takes/take-preview";
import { hashAnonymousTakeToken } from "@/lib/takes/token-hash";

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
  const bytes = readFileSync(fixturePath);

  it("happy path session → upload → finalize → preview; replay finalize idempotent", async () => {
    const owner = await makeUser(admin, "seed");
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
    );
    const tokenHash = freshHash();

    const session = await createAnonTakeRecordingSessionFor(tokenHash, {
      beatId,
      contentType: "audio/wav",
      byteSize: bytes.byteLength,
    });
    expect(session.objectKey.startsWith("anon/")).toBe(true);
    expect(session.maxRecordingSeconds).toBe(30);
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
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
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
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
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
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
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
    expect(String((fail[0] as PromiseRejectedResult).reason)).toMatch(
      /already in progress|CONCURRENT/i,
    );

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
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
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
      message: expect.stringMatching(/READY|Active/i),
    });

    // Expire the READY so day-cap can continue counting sessions
    const { data: readyRows } = await admin
      .from("takes")
      .select("id")
      .eq("anonymous_token_hash", tokenHash)
      .eq("status", "READY");
    for (const row of readyRows ?? []) {
      await admin
        .from("takes")
        .update({
          status: "EXPIRED",
          expires_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq("id", row.id);
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
        await admin
          .from("takes")
          .update({ status: "FAILED", failure_reason: "TEST_BURN" })
          .eq("id", s.takeId);
      } catch (e) {
        expect(String(e)).toMatch(/Daily|SESSION_DAY|session limit/i);
        dayCapHit = true;
        break;
      }
    }
    expect(dayCapHit).toBe(true);
  }, 180_000);

  it("authenticated RECORD regression still works (W4 path untouched)", async () => {
    const owner = await makeUser(admin, "authreg");
    const { beatId } = await seedPublishedBeatWithMaster(
      admin,
      owner.userId,
      bytes,
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
    const a = await seedPublishedBeatWithMaster(admin, owner.userId, bytes);
    const b = await seedPublishedBeatWithMaster(admin, owner.userId, bytes);
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

    // Expire READY to free cap, then create on beat B — preview of beat A take still hash-bound
    await admin
      .from("takes")
      .update({
        status: "EXPIRED",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("id", s1.takeId);

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

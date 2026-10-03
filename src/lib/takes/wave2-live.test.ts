/**
 * Live E2E — Recording Wave 2 take transport + security matrix.
 * Uses existing PUBLISHED beat + fixture WAV via signed take-audio upload.
 */
import { randomUUID } from "crypto";
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
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";

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
      displayName: "Wave2Rec",
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
  const email = `wave2-rec-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave2Rec-${randomUUID()}`;
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
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return { userId, email, client, context: userContext(userId, email) };
}

/** Dedicated PUBLISHED beat + READY master sized for the 30s fixture. */
async function seedPublishedBeatWithMaster(
  admin: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
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
        title: "W2 recording target",
        bpm: 120,
        duration_seconds: 30,
        status: "PUBLISHED",
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

describe.runIf(live)("Recording Wave 2 live transport + security", () => {
  it(
    "happy path + security matrix A–M",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      expect(bytes.byteLength).toBeGreaterThan(1000);

      const userA = await makeUser(admin, "A");
      const userB = await makeUser(admin, "B");

      const seeded = await seedPublishedBeatWithMaster(
        admin,
        userA.userId,
        bytes,
      );
      const publishedBeatId = seeded.beatId;

      // K — PUBLISHED works: session → upload → finalize → READY
      const session = await createTakeRecordingSessionFor(userA.context, {
        beatId: publishedBeatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      expect(session.takeId).toBeTruthy();
      expect(session.objectKey).toBe(
        buildUserTakeObjectKey({
          ownerId: userA.userId,
          takeId: session.takeId,
        }),
      );
      expect(session.maxRecordingSeconds).toBe(30);

      // Signed upload via user A client
      const { error: putErr } = await userA.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .uploadToSignedUrl(session.path, session.token, bytes, {
          contentType: "audio/wav",
          upsert: false,
        });
      expect(putErr).toBeNull();

      const ready = await finalizeTakeRecordingFor(userA.context, {
        takeId: session.takeId,
      });
      expect(ready.status).toBe("READY");
      expect(ready.durationSeconds).toBe(30);

      // Duplicate finalize = idempotent READY
      const again = await finalizeTakeRecordingFor(userA.context, {
        takeId: session.takeId,
      });
      expect(again.status).toBe("READY");
      expect(again.takeId).toBe(session.takeId);

      // A — USER B cannot finalize USER A take
      await expect(
        finalizeTakeRecordingFor(userB.context, { takeId: session.takeId }),
      ).rejects.toBeInstanceOf(AuthError);

      // B — USER B cannot forge objectKey on session
      await expect(
        createTakeRecordingSessionFor(userB.context, {
          beatId: publishedBeatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
          objectKey: session.objectKey,
        }),
      ).rejects.toBeInstanceOf(AuthError);

      // C — client cannot choose object key / owner
      await expect(
        createTakeRecordingSessionFor(userA.context, {
          beatId: publishedBeatId,
          contentType: "audio/wav",
          byteSize: 100,
          ownerId: userB.userId,
        }),
      ).rejects.toBeInstanceOf(AuthError);

      // D/E — client cannot set owner_id / READY via transport (RLS + service only)
      const spoof = await userA.client
        .from("takes")
        .update({ owner_id: userB.userId, status: "READY" })
        .eq("id", session.takeId)
        .select("owner_id, status");
      expect(spoof.data ?? []).toHaveLength(0);
      const { data: stillA } = await admin
        .from("takes")
        .select("owner_id, status")
        .eq("id", session.takeId)
        .single();
      expect(stillA!.owner_id).toBe(userA.userId);
      expect(stillA!.status).toBe("READY");

      // Create DRAFT / REJECTED / ARCHIVED beats for H/I/J
      const draftId = randomUUID();
      const rejectedId = randomUUID();
      const archivedId = randomUUID();
      for (const row of [
        { id: draftId, status: "DRAFT", title: "W2 draft" },
        { id: rejectedId, status: "REJECTED", title: "W2 rejected" },
        { id: archivedId, status: "ARCHIVED", title: "W2 archived" },
      ]) {
        expect(
          (
            await admin.from("beats").insert({
              id: row.id,
              ownership_type: "USER",
              owner_id: userA.userId,
              title: row.title,
              bpm: 120,
              duration_seconds: 30,
              status: row.status,
            })
          ).error,
        ).toBeNull();
      }

      // H DRAFT
      await expect(
        createTakeRecordingSessionFor(userA.context, {
          beatId: draftId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/PUBLISHED/i) });

      // I REJECTED
      await expect(
        createTakeRecordingSessionFor(userA.context, {
          beatId: rejectedId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/PUBLISHED/i) });

      // J ARCHIVED
      await expect(
        createTakeRecordingSessionFor(userA.context, {
          beatId: archivedId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/PUBLISHED/i) });

      // G — foreign beat id that does not exist
      await expect(
        createTakeRecordingSessionFor(userA.context, {
          beatId: randomUUID(),
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // M — expired take DENY finalize
      // Constraint: expires_at > created_at — backdate both timestamps.
      const expiredSession = await createTakeRecordingSessionFor(
        userA.context,
        {
          beatId: publishedBeatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        },
      );
      const createdPast = new Date(Date.now() - 3_600_000).toISOString();
      const expiresPast = new Date(Date.now() - 1_800_000).toISOString();
      const { data: expiredRow, error: expUpErr } = await admin
        .from("takes")
        .update({
          created_at: createdPast,
          expires_at: expiresPast,
        })
        .eq("id", expiredSession.takeId)
        .select("expires_at, status")
        .single();
      expect(expUpErr).toBeNull();
      expect(new Date(expiredRow!.expires_at as string).getTime()).toBeLessThan(
        Date.now(),
      );
      await expect(
        finalizeTakeRecordingFor(userA.context, {
          takeId: expiredSession.takeId,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/expired/i) });
      const { data: expiredStatus } = await admin
        .from("takes")
        .select("status")
        .eq("id", expiredSession.takeId)
        .single();
      expect(expiredStatus!.status).toBe("EXPIRED");

      // Missing object finalize → FAILED
      const missingSession = await createTakeRecordingSessionFor(
        userA.context,
        {
          beatId: publishedBeatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        },
      );
      await expect(
        finalizeTakeRecordingFor(userA.context, {
          takeId: missingSession.takeId,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/missing/i) });
      const { data: failedTake } = await admin
        .from("takes")
        .select("status, failure_reason")
        .eq("id", missingSession.takeId)
        .single();
      expect(failedTake!.status).toBe("FAILED");
      expect(failedTake!.failure_reason).toBe("OBJECT_MISSING");

      // Wrong status finalize (FAILED)
      await expect(
        finalizeTakeRecordingFor(userA.context, {
          takeId: missingSession.takeId,
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/not awaiting finalize/i),
      });

      // Private take-audio: anon list/download deny
      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: listed } = await anon.storage.from(TAKE_AUDIO_BUCKET).list(
        `user/${userA.userId}/takes`,
      );
      expect(listed ?? []).toHaveLength(0);

      // Regression: beat-audio bucket still distinct
      expect(TAKE_AUDIO_BUCKET).not.toBe(BEAT_AUDIO_BUCKET);

      // Cleanup
      await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .remove([session.objectKey])
        .catch(() => undefined);
      await admin.storage
        .from(BEAT_AUDIO_BUCKET)
        .remove([seeded.objectKey])
        .catch(() => undefined);
      await admin
        .from("takes")
        .delete()
        .in("id", [
          session.takeId,
          expiredSession.takeId,
          missingSession.takeId,
        ]);
      await admin
        .from("beat_audio_assets")
        .delete()
        .eq("id", seeded.assetId);
      await admin
        .from("beats")
        .delete()
        .in("id", [publishedBeatId, draftId, rejectedId, archivedId]);
      await admin.auth.admin.deleteUser(userA.userId);
      await admin.auth.admin.deleteUser(userB.userId);
    },
    120_000,
  );

  it(
    "duration fail-closed + max duration exceeded",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const user = await makeUser(admin, "dur");
      const seeded = await seedPublishedBeatWithMaster(
        admin,
        user.userId,
        bytes,
      );

      // Garbage bytes → duration probe fail-closed
      const session = await createTakeRecordingSessionFor(user.context, {
        beatId: seeded.beatId,
        contentType: "audio/webm",
        byteSize: 64,
      });
      const garbage = Buffer.from("not-a-real-audio-file-xxxxxxxxxxxx");
      const { error: putErr } = await user.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .uploadToSignedUrl(session.path, session.token, garbage, {
          contentType: "audio/webm",
          upsert: false,
        });
      expect(putErr).toBeNull();

      await expect(
        finalizeTakeRecordingFor(user.context, { takeId: session.takeId }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/fail-closed|Duration/i),
      });
      const { data: failed } = await admin
        .from("takes")
        .select("status, failure_reason")
        .eq("id", session.takeId)
        .single();
      expect(failed!.status).toBe("FAILED");
      expect(failed!.failure_reason).toBe("DURATION_PROBE_FAILED");

      // Max duration: shrink snapshot then upload long fixture
      const session2 = await createTakeRecordingSessionFor(user.context, {
        beatId: seeded.beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
      });
      await admin
        .from("takes")
        .update({ recording_max_seconds_snapshot: 1 })
        .eq("id", session2.takeId);
      const { error: put2 } = await user.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .uploadToSignedUrl(session2.path, session2.token, bytes, {
          contentType: "audio/wav",
          upsert: false,
        });
      expect(put2).toBeNull();
      await expect(
        finalizeTakeRecordingFor(user.context, { takeId: session2.takeId }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/exceeds max/i),
      });

      await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .remove([session.objectKey, session2.objectKey])
        .catch(() => undefined);
      await admin.storage
        .from(BEAT_AUDIO_BUCKET)
        .remove([seeded.objectKey])
        .catch(() => undefined);
      await admin
        .from("takes")
        .delete()
        .in("id", [session.takeId, session2.takeId]);
      await admin
        .from("beat_audio_assets")
        .delete()
        .eq("id", seeded.assetId);
      await admin.from("beats").delete().eq("id", seeded.beatId);
      await admin.auth.admin.deleteUser(user.userId);
    },
    90_000,
  );

  it(
    "WEBM_OPUS_CHROMIUM: MediaRecorder webm finalize → READY (duration via decode fallback)",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const beatBytes = readFileSync(fixturePath);
      const webmPath = resolve(
        process.cwd(),
        "src/lib/beats/fixtures/chromium-mediarecorder-opus.webm",
      );
      expect(existsSync(webmPath)).toBe(true);
      const webmBytes = readFileSync(webmPath);
      expect(webmBytes.byteLength).toBeGreaterThan(1000);

      const user = await makeUser(admin, "webm");
      const seeded = await seedPublishedBeatWithMaster(
        admin,
        user.userId,
        beatBytes,
      );

      const session = await createTakeRecordingSessionFor(user.context, {
        beatId: seeded.beatId,
        contentType: "audio/webm",
        byteSize: webmBytes.byteLength,
      });

      const { error: putErr } = await user.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .uploadToSignedUrl(session.path, session.token, webmBytes, {
          contentType: "audio/webm",
          upsert: false,
        });
      expect(putErr).toBeNull();

      const ready = await finalizeTakeRecordingFor(user.context, {
        takeId: session.takeId,
      });
      expect(ready.status).toBe("READY");
      expect(ready.contentType).toBe("audio/webm");
      expect(ready.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(ready.durationSeconds).toBeLessThanOrEqual(4);

      await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .remove([session.objectKey])
        .catch(() => undefined);
      await admin.storage
        .from(BEAT_AUDIO_BUCKET)
        .remove([seeded.objectKey])
        .catch(() => undefined);
      await admin.from("takes").delete().eq("id", session.takeId);
      await admin
        .from("beat_audio_assets")
        .delete()
        .eq("id", seeded.assetId);
      await admin.from("beats").delete().eq("id", seeded.beatId);
      await admin.auth.admin.deleteUser(user.userId);
    },
    90_000,
  );
});

/**
 * Live — Recording Wave 4 entitlement, anti-abuse, download, delete, janitor.
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
import { createOwnTakeDownloadSignedUrlFor } from "@/lib/takes/take-download";
import { softDeleteOwnTakeFor } from "@/lib/takes/take-delete";
import { createOwnTakePreviewSignedUrlFor } from "@/lib/takes/take-preview";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { runTakesRetentionJanitor } from "@/lib/takes/takes-janitor";
import type { AccountLevel } from "@/types/domain";

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

function userContext(
  userId: string,
  email: string,
  accountLevel: AccountLevel,
): AuthContext {
  return {
    userId,
    email,
    profile: {
      id: userId,
      displayName: "Wave4",
      userNumber: null,
      role: "USER",
      accountLevel,
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

async function makeUser(
  admin: SupabaseClient,
  label: string,
  accountLevel: AccountLevel = "BEGINNER_RAPPER",
) {
  const email = `wave4-rec-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave4Rec-${randomUUID()}`;
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
    account_level: accountLevel,
    display_name: label,
  });
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return {
    userId,
    email,
    client,
    context: userContext(userId, email, accountLevel),
  };
}

async function seedPublishedBeat(
  admin: SupabaseClient,
  ownerId: string,
  bytes: Buffer,
  durationSeconds: number,
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
        title: "W4 target",
        bpm: 120,
        duration_seconds: durationSeconds,
        status: "PUBLISHED",
        tags: [],
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.storage.from(BEAT_AUDIO_BUCKET).upload(objectKey, bytes, {
        contentType: "audio/wav",
        upsert: false,
      })
    ).error,
  ).toBeNull();
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

async function cleanupTakeBundle(
  admin: SupabaseClient,
  params: {
    takeIds: string[];
    beatId: string;
    assetId: string;
    beatObjectKey: string;
    userIds: string[];
  },
) {
  for (const takeId of params.takeIds) {
    const { data: t } = await admin
      .from("takes")
      .select("object_key")
      .eq("id", takeId)
      .maybeSingle();
    if (t?.object_key) {
      await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .remove([t.object_key as string]);
    }
    await admin.from("takes").delete().eq("id", takeId);
  }
  await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .remove([params.beatObjectKey]);
  await admin.from("beat_audio_assets").delete().eq("id", params.assetId);
  await admin.from("beats").delete().eq("id", params.beatId);
  for (const uid of params.userIds) {
    await admin.auth.admin.deleteUser(uid);
  }
}

describe.runIf(live)("Recording Wave 4 live", () => {
  it(
    "BEGINNER record→download→delete; IDOR; expired DENY; concurrent + active cap",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const owner = await makeUser(admin, "owner", "BEGINNER_RAPPER");
      const other = await makeUser(admin, "other", "BEGINNER_RAPPER");
      const seeded = await seedPublishedBeat(admin, owner.userId, bytes, 30);
      const takeIds: string[] = [];

      try {
        const session = await createTakeRecordingSessionFor(owner.context, {
          beatId: seeded.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        takeIds.push(session.takeId);
        expect(session.maxRecordingSeconds).toBe(30);

        // Concurrent PENDING blocked
        await expect(
          createTakeRecordingSessionFor(owner.context, {
            beatId: seeded.beatId,
            contentType: "audio/wav",
            byteSize: bytes.byteLength,
          }),
        ).rejects.toMatchObject({
          message: expect.stringMatching(/already in progress/i),
        });

        expect(
          (
            await owner.client.storage
              .from(TAKE_AUDIO_BUCKET)
              .uploadToSignedUrl(session.path, session.token, bytes, {
                contentType: "audio/wav",
                upsert: false,
              })
          ).error,
        ).toBeNull();

        const ready = await finalizeTakeRecordingFor(owner.context, {
          takeId: session.takeId,
        });
        expect(ready.status).toBe("READY");

        const download = await createOwnTakeDownloadSignedUrlFor(
          owner.context,
          { takeId: session.takeId },
        );
        expect(download.url).toMatch(/^https?:\/\//);
        expect(download.url).not.toMatch(/\/storage\/v1\/object\/public\//);

        await expect(
          createOwnTakeDownloadSignedUrlFor(other.context, {
            takeId: session.takeId,
          }),
        ).rejects.toBeInstanceOf(AuthError);

        // Fill active READY to cap (BEGINNER=3): already 1 READY
        for (let i = 0; i < 2; i++) {
          const s = await createTakeRecordingSessionFor(owner.context, {
            beatId: seeded.beatId,
            contentType: "audio/wav",
            byteSize: bytes.byteLength,
          });
          takeIds.push(s.takeId);
          expect(
            (
              await owner.client.storage
                .from(TAKE_AUDIO_BUCKET)
                .uploadToSignedUrl(s.path, s.token, bytes, {
                  contentType: "audio/wav",
                  upsert: false,
                })
            ).error,
          ).toBeNull();
          await finalizeTakeRecordingFor(owner.context, { takeId: s.takeId });
        }

        await expect(
          createTakeRecordingSessionFor(owner.context, {
            beatId: seeded.beatId,
            contentType: "audio/wav",
            byteSize: bytes.byteLength,
          }),
        ).rejects.toMatchObject({
          message: expect.stringMatching(/Active READY take limit/i),
        });

        const deleted = await softDeleteOwnTakeFor(owner.context, {
          takeId: session.takeId,
        });
        expect(deleted.status).toBe("DELETED");

        await expect(
          createOwnTakePreviewSignedUrlFor(owner.context, {
            takeId: session.takeId,
          }),
        ).rejects.toMatchObject({ message: expect.stringMatching(/deleted/i) });
        await expect(
          createOwnTakeDownloadSignedUrlFor(owner.context, {
            takeId: session.takeId,
          }),
        ).rejects.toMatchObject({ message: expect.stringMatching(/deleted/i) });

        // Cap frees after delete — new session allowed
        const afterDelete = await createTakeRecordingSessionFor(owner.context, {
          beatId: seeded.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        takeIds.push(afterDelete.takeId);
        // Mark FAILED so concurrent unique clears without upload
        await admin
          .from("takes")
          .update({ status: "FAILED", failure_reason: "TEST_CLEANUP" })
          .eq("id", afterDelete.takeId);

        // Expire a READY take + janitor (respect takes_expires_after_created_chk)
        const expireTarget = takeIds[1]!;
        const createdPast = new Date(Date.now() - 3_600_000).toISOString();
        const expiresPast = new Date(Date.now() - 1_800_000).toISOString();
        const { error: expErr } = await admin
          .from("takes")
          .update({ created_at: createdPast, expires_at: expiresPast })
          .eq("id", expireTarget)
          .eq("status", "READY");
        expect(expErr).toBeNull();
        const { data: expRow } = await admin
          .from("takes")
          .select("expires_at, status, deleted_at")
          .eq("id", expireTarget)
          .single();
        expect(expRow?.status).toBe("READY");
        expect(expRow?.deleted_at).toBeNull();
        expect(new Date(expRow!.expires_at as string).getTime()).toBeLessThan(
          Date.now(),
        );

        await expect(
          createOwnTakeDownloadSignedUrlFor(owner.context, {
            takeId: expireTarget,
          }),
        ).rejects.toMatchObject({ message: expect.stringMatching(/expired/i) });

        const janitor = await runTakesRetentionJanitor({
          now: new Date(),
          limit: 20,
        });
        expect(janitor.expiredMarked + janitor.scanned).toBeGreaterThan(0);

        const { data: expiredRow } = await admin
          .from("takes")
          .select("status")
          .eq("id", expireTarget)
          .single();
        expect(expiredRow?.status).toBe("EXPIRED");

        // RLS: foreign SELECT empty; owner SELECT hides deleted
        const { data: foreignSelect } = await other.client
          .from("takes")
          .select("id")
          .eq("id", session.takeId);
        expect(foreignSelect ?? []).toHaveLength(0);

        const { data: ownerDeletedSelect } = await owner.client
          .from("takes")
          .select("id")
          .eq("id", session.takeId);
        expect(ownerDeletedSelect ?? []).toHaveLength(0);
      } finally {
        await cleanupTakeBundle(admin, {
          takeIds,
          beatId: seeded.beatId,
          assetId: seeded.assetId,
          beatObjectKey: seeded.objectKey,
          userIds: [owner.userId, other.userId],
        });
      }
    },
    180_000,
  );

  it(
    "PRO entitlement uses MIN(beat, 180) on session snapshot",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const owner = await makeUser(admin, "pro", "PRO_RAPPER");
      const seeded = await seedPublishedBeat(admin, owner.userId, bytes, 90);
      let takeId: string | null = null;
      try {
        const session = await createTakeRecordingSessionFor(owner.context, {
          beatId: seeded.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        takeId = session.takeId;
        expect(session.maxRecordingSeconds).toBe(90);
        const { data: row } = await admin
          .from("takes")
          .select("recording_max_seconds_snapshot, recording_mode")
          .eq("id", session.takeId)
          .single();
        expect(row?.recording_max_seconds_snapshot).toBe(90);
        expect(row?.recording_mode).toBe("FULL");
        await admin
          .from("takes")
          .update({ status: "FAILED", failure_reason: "TEST_CLEANUP" })
          .eq("id", session.takeId);
      } finally {
        await cleanupTakeBundle(admin, {
          takeIds: takeId ? [takeId] : [],
          beatId: seeded.beatId,
          assetId: seeded.assetId,
          beatObjectKey: seeded.objectKey,
          userIds: [owner.userId],
        });
      }
    },
    120_000,
  );

  it(
    "LEGEND entitlement is MIN(beat, 180) on max-duration beat",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const owner = await makeUser(admin, "legend", "LEGEND_RAPPER");
      // beats_duration_range_chk caps beat at 180 — longer-than-180 covered in unit tests
      const seeded = await seedPublishedBeat(admin, owner.userId, bytes, 180);
      let takeId: string | null = null;
      try {
        const session = await createTakeRecordingSessionFor(owner.context, {
          beatId: seeded.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        takeId = session.takeId;
        expect(session.maxRecordingSeconds).toBe(180);
        await admin
          .from("takes")
          .update({ status: "FAILED", failure_reason: "TEST_CLEANUP" })
          .eq("id", session.takeId);
      } finally {
        await cleanupTakeBundle(admin, {
          takeIds: takeId ? [takeId] : [],
          beatId: seeded.beatId,
          assetId: seeded.assetId,
          beatObjectKey: seeded.objectKey,
          userIds: [owner.userId],
        });
      }
    },
    120_000,
  );
});

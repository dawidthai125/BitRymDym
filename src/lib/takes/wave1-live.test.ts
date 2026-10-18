/**
 * Live foundation — Recording Wave 1: takes RLS + take-audio storage.
 * No MediaRecorder / product upload transport.
 * Creates its own PUBLISHED beat; every user, beat and object is tracked by
 * `createIntegrationFixtures` and removed via `onTestFinished` (also on failure).
 */
import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, onTestFinished } from "vitest";

import { applyIntegrationEnv, resolveIntegrationEnv } from "@/test/integration-env";
import {
  createIntegrationFixtures,
  type IntegrationFixtures,
} from "@/test/integration-fixtures";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";

const integration = resolveIntegrationEnv();
const live = integration.enabled;
const url = integration.enabled ? integration.url : undefined;
const serviceKey = integration.enabled ? integration.serviceKey : undefined;
const anonKey = integration.enabled ? integration.anonKey : undefined;

if (integration.enabled) applyIntegrationEnv(integration);

async function makeUser(
  admin: SupabaseClient,
  fixtures: IntegrationFixtures,
  label: string,
) {
  const email = `wave1-take-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave1Take-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const userId = fixtures.trackUser(data.user!.id);
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    role: "USER",
    account_level: "BEGINNER_RAPPER",
    display_name: label,
  });
  expect(profileErr).toBeNull();
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return { userId, client };
}

describe.runIf(live)("Recording Wave 1 live foundation", () => {
  it(
    "RLS owner isolation + constraints + private take-audio; beat-audio regression",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const fixtures = createIntegrationFixtures(admin);
      onTestFinished(() => fixtures.cleanup());
      const owner = await makeUser(admin, fixtures, "owner");
      const other = await makeUser(admin, fixtures, "other");
      const staff = await makeUser(admin, fixtures, "mod");
      await admin
        .from("profiles")
        .update({ role: "MODERATOR" })
        .eq("id", staff.userId);

      const seededBeatId = fixtures.trackBeat(randomUUID());
      const { error: seedErr } = await admin.from("beats").insert({
        id: seededBeatId,
        owner_id: owner.userId,
        ownership_type: "USER",
        title: `Wave1 Beat ${seededBeatId.slice(0, 6)}`,
        bpm: 120,
        duration_seconds: 90,
        status: "PUBLISHED",
        tags: [],
      });
      expect(seedErr).toBeNull();

      const { data: pubBeat, error: beatErr } = await admin
        .from("beats")
        .select("id, duration_seconds, bpm")
        .eq("id", seededBeatId)
        .eq("status", "PUBLISHED")
        .maybeSingle();
      expect(beatErr).toBeNull();
      expect(pubBeat?.id).toBeTruthy();
      const beatId = pubBeat!.id as string;
      const beatDuration = pubBeat!.duration_seconds as number;
      const beatBpm = (pubBeat!.bpm as number) ?? null;

      const takeId = randomUUID();
      const objectKey = buildUserTakeObjectKey({
        ownerId: owner.userId,
        takeId,
      });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Client INSERT DENY
      const { error: clientInsertErr } = await owner.client.from("takes").insert({
        id: takeId,
        owner_id: owner.userId,
        beat_id: beatId,
        status: "PENDING_UPLOAD",
        recording_mode: "QUICK",
        storage_bucket: "take-audio",
        object_key: objectKey,
        beat_duration_seconds_snapshot: beatDuration,
        recording_max_seconds_snapshot: 30,
        beat_bpm_snapshot: beatBpm,
        expires_at: expiresAt,
      });
      expect(clientInsertErr).not.toBeNull();

      // Service INSERT PASS
      expect(
        (
          await admin.from("takes").insert({
            id: takeId,
            owner_id: owner.userId,
            beat_id: beatId,
            status: "PENDING_UPLOAD",
            recording_mode: "QUICK",
            storage_bucket: "take-audio",
            object_key: objectKey,
            beat_duration_seconds_snapshot: beatDuration,
            recording_max_seconds_snapshot: 30,
            beat_bpm_snapshot: beatBpm,
            expires_at: expiresAt,
          })
        ).error,
      ).toBeNull();

      // Owner SELECT own PASS
      const { data: ownRow, error: ownErr } = await owner.client
        .from("takes")
        .select("id, owner_id, status")
        .eq("id", takeId)
        .maybeSingle();
      expect(ownErr).toBeNull();
      expect(ownRow?.id).toBe(takeId);
      expect(ownRow?.owner_id).toBe(owner.userId);

      // Foreign SELECT DENY (empty)
      const { data: foreignRow } = await other.client
        .from("takes")
        .select("id")
        .eq("id", takeId)
        .maybeSingle();
      expect(foreignRow).toBeNull();

      // Moderator SELECT DENY (no staff blanket)
      const { data: modRow } = await staff.client
        .from("takes")
        .select("id")
        .eq("id", takeId)
        .maybeSingle();
      expect(modRow).toBeNull();

      // Anon SELECT DENY
      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: anonRow } = await anon
        .from("takes")
        .select("id")
        .eq("id", takeId)
        .maybeSingle();
      expect(anonRow).toBeNull();

      // Owner spoof UPDATE: no UPDATE policy → 0 rows; ownership unchanged
      await owner.client
        .from("takes")
        .update({ owner_id: other.userId })
        .eq("id", takeId);
      const { data: stillOwned } = await admin
        .from("takes")
        .select("owner_id")
        .eq("id", takeId)
        .single();
      expect(stillOwned?.owner_id).toBe(owner.userId);

      // Invalid duration DENY (service CHECK)
      const badDurId = randomUUID();
      const { error: badDurErr } = await admin.from("takes").insert({
        id: badDurId,
        owner_id: owner.userId,
        beat_id: beatId,
        status: "PENDING_UPLOAD",
        recording_mode: "QUICK",
        duration_seconds: 181,
        storage_bucket: "take-audio",
        object_key: buildUserTakeObjectKey({
          ownerId: owner.userId,
          takeId: badDurId,
        }),
        beat_duration_seconds_snapshot: beatDuration,
        recording_max_seconds_snapshot: 30,
        expires_at: expiresAt,
      });
      expect(badDurErr).not.toBeNull();

      // Invalid beat FK DENY
      const badBeatId = randomUUID();
      const { error: badBeatErr } = await admin.from("takes").insert({
        id: randomUUID(),
        owner_id: owner.userId,
        beat_id: badBeatId,
        status: "PENDING_UPLOAD",
        recording_mode: "QUICK",
        storage_bucket: "take-audio",
        object_key: buildUserTakeObjectKey({
          ownerId: owner.userId,
          takeId: randomUUID(),
        }),
        beat_duration_seconds_snapshot: 90,
        recording_max_seconds_snapshot: 30,
        expires_at: expiresAt,
      });
      expect(badBeatErr).not.toBeNull();

      // Valid duration READY path PASS
      expect(
        (
          await admin
            .from("takes")
            .update({
              status: "READY",
              duration_seconds: 12,
              byte_size: 1024,
              content_type: "audio/webm",
            })
            .eq("id", takeId)
        ).error,
      ).toBeNull();

      // Soft delete foundation (service)
      expect(
        (
          await admin
            .from("takes")
            .update({
              status: "DELETED",
              deleted_at: new Date().toISOString(),
            })
            .eq("id", takeId)
        ).error,
      ).toBeNull();
      const { data: afterDelete } = await owner.client
        .from("takes")
        .select("id")
        .eq("id", takeId)
        .maybeSingle();
      expect(afterDelete).toBeNull();

      // Storage: take-audio private — client INSERT DENY
      const clientPath = `user/${owner.userId}/takes/${randomUUID()}/mic.bin`;
      fixtures.trackObject(TAKE_AUDIO_BUCKET, clientPath);
      const { error: storageInsertErr } = await owner.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .upload(clientPath, new Uint8Array([1, 2, 3]), {
          contentType: "audio/webm",
          upsert: false,
        });
      expect(storageInsertErr).not.toBeNull();

      // Service signed upload foundation PASS
      const signedKey = `user/${owner.userId}/takes/${randomUUID()}/mic.bin`;
      fixtures.trackObject(TAKE_AUDIO_BUCKET, signedKey);
      const signed = await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .createSignedUploadUrl(signedKey);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toMatch(/^https?:\/\//);

      const put = await fetch(signed.data!.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: new Uint8Array([9, 8, 7, 6]),
      });
      expect(put.ok).toBe(true);

      const signedRead = await admin.storage
        .from(TAKE_AUDIO_BUCKET)
        .createSignedUrl(signedKey, 60);
      expect(signedRead.error).toBeNull();

      // Client list/select object DENY (no policy)
      const { data: listed } = await owner.client.storage
        .from(TAKE_AUDIO_BUCKET)
        .list(`user/${owner.userId}/takes`);
      // empty or error — must not expose foreign objects; list often returns []
      expect(Array.isArray(listed) ? listed.length : 0).toBe(0);

      await admin.storage.from(TAKE_AUDIO_BUCKET).remove([signedKey]);

      // Regression: beat-audio bucket still present / private
      const { data: buckets } = await admin.storage.listBuckets();
      const beatBucket = buckets?.find((b) => b.id === BEAT_AUDIO_BUCKET);
      const takeBucket = buckets?.find((b) => b.id === TAKE_AUDIO_BUCKET);
      expect(beatBucket?.public).toBe(false);
      expect(takeBucket?.public).toBe(false);
    },
    120_000,
  );
});

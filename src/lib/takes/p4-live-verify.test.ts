/**
 * P4 live verification — eligibility, title, list, RAW AuthZ, export enqueue.
 * Local Supabase only: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* + bpm fixture.
 * Every user, beat and Storage object is tracked by `createIntegrationFixtures`
 * at creation and removed in FK-safe order (takes before their beats, beats
 * before their owners — `prevent_beat_privilege_escalation` rejects the
 * `beats.owner_id` SET NULL that deleting an owner of a live beat triggers).
 * Export enqueue honours E3_RENDER_JOBS_ENABLED from the shell (DISABLED otherwise).
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { applyIntegrationEnv, resolveIntegrationEnv } from "@/test/integration-env";
import {
  createIntegrationFixtures,
  type IntegrationFixtures,
} from "@/test/integration-fixtures";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  isMixRenderJobTier,
  isRenderJobTier,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import {
  BEAT_AUDIO_BUCKET,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";
import { listOwnTakesFor } from "@/lib/takes/list-own-takes";
import { resolveRecordingEligibility } from "@/lib/takes/recording-eligibility-service";
import { createOwnTakeDownloadSignedUrlFor } from "@/lib/takes/take-download";
import { buildTakeExportLadder } from "@/lib/takes/take-export-capability";
import { createTakeExportJobFor } from "@/lib/takes/take-export-service";
import { createOwnTakePreviewSignedUrlFor } from "@/lib/takes/take-preview";
import { updateOwnTakeTitleFor } from "@/lib/takes/take-title-service";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import type { AccountLevel } from "@/types/domain";

const fixturePath = resolve(
  process.cwd(),
  "../bitrymdym-fixtures/bpm-120-steady.wav",
);
const integration = resolveIntegrationEnv({ fixturePath });
const live = integration.enabled;
const url = integration.enabled ? integration.url : undefined;
const serviceKey = integration.enabled ? integration.serviceKey : undefined;
const anonKey = integration.enabled ? integration.anonKey : undefined;

if (integration.enabled) applyIntegrationEnv(integration);

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
      displayName: email.split("@")[0] ?? "user",
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
  fixtures: IntegrationFixtures,
  tag: string,
  accountLevel: AccountLevel,
  premiumTier: "FREE" | "BRONZE" | "SILVER" | "GOLD",
) {
  const email = `p4v-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `P4!${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser");
  const userId = fixtures.trackUser(data.user.id);
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    role: "USER",
    account_level: accountLevel,
    display_name: `P4 ${tag}`,
  });
  if (profileErr) throw new Error(profileErr.message);
  if (premiumTier !== "FREE") {
    const { error: premErr } = await admin.from("premium_entitlements").upsert({
      user_id: userId,
      active: true,
      source: "p4-live-verify",
      tier: premiumTier,
      expires_at: null,
    });
    if (premErr) throw new Error(premErr.message);
  }
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return {
    userId,
    client,
    context: userContext(userId, email, accountLevel),
  };
}

async function seedPublishedBeat(
  admin: SupabaseClient,
  fixtures: IntegrationFixtures,
  ownerId: string,
  bytes: Buffer,
  durationSeconds: number,
) {
  const beatId = fixtures.trackBeat(randomUUID());
  const assetId = randomUUID();
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId,
    beatId,
    assetId,
    purpose: "MASTER",
  });
  const { error: beatErr } = await admin.from("beats").insert({
    id: beatId,
    owner_id: ownerId,
    ownership_type: "USER",
    title: `P4V Beat ${beatId.slice(0, 6)}`,
    bpm: 120,
    duration_seconds: durationSeconds,
    status: "PUBLISHED",
    tags: [],
  });
  if (beatErr) throw new Error(beatErr.message);
  fixtures.trackObject(BEAT_AUDIO_BUCKET, objectKey);
  const { error: upErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, bytes, { contentType: "audio/wav", upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error: assetErr } = await admin.from("beat_audio_assets").insert({
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
  });
  if (assetErr) throw new Error(assetErr.message);
  return { beatId, assetId, objectKey };
}

describe.runIf(live)("P4 live verification", () => {
  it(
    "eligibility, title, list ladder, RAW AuthZ, TAKE_EXPORT enqueue/guards",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const fixtures = createIntegrationFixtures(admin);

      try {
        const free = await makeUser(admin, fixtures, "free", "BEGINNER_RAPPER", "FREE");
        const gold = await makeUser(admin, fixtures, "gold", "LEGEND_RAPPER", "GOLD");
        const other = await makeUser(admin, fixtures, "other", "BEGINNER_RAPPER", "FREE");
        const seeded = await seedPublishedBeat(admin, fixtures, free.userId, bytes, 60);

        const eligOk = await resolveRecordingEligibility({
          beatId: seeded.beatId,
          context: free.context,
        });
        expect(eligOk.allowed).toBe(true);
        expect(eligOk.code).toBe("ALLOWED");

        const draftId = fixtures.trackBeat(randomUUID());
        await admin.from("beats").insert({
          id: draftId,
          owner_id: free.userId,
          ownership_type: "USER",
          title: "Draft",
          bpm: 120,
          duration_seconds: 30,
          status: "DRAFT",
          tags: [],
        });
        const eligDeny = await resolveRecordingEligibility({
          beatId: draftId,
          context: free.context,
        });
        await admin.from("beats").delete().eq("id", draftId);
        expect(eligDeny.allowed).toBe(false);
        expect(eligDeny.code).toBe("BEAT_NOT_PUBLISHED");

        const session = await createTakeRecordingSessionFor(free.context, {
          beatId: seeded.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        expect(
          (
            await free.client.storage
              .from(TAKE_AUDIO_BUCKET)
              .uploadToSignedUrl(session.path, session.token, bytes, {
                contentType: "audio/wav",
                upsert: false,
              })
          ).error,
        ).toBeNull();
        await finalizeTakeRecordingFor(free.context, { takeId: session.takeId });

        await updateOwnTakeTitleFor(free.context, {
          takeId: session.takeId,
          title: "  Moje nagranie P4  ",
        });
        const { data: titled } = await admin
          .from("takes")
          .select("title")
          .eq("id", session.takeId)
          .single();
        expect(titled?.title).toBe("Moje nagranie P4");

        await expect(
          updateOwnTakeTitleFor(free.context, {
            takeId: session.takeId,
            title: "x".repeat(121),
          }),
        ).rejects.toBeInstanceOf(AuthError);

        const listed = await listOwnTakesFor(free.context);
        const item = listed.find((t) => t.id === session.takeId);
        expect(item?.displayTitle).toBe("Moje nagranie P4");
        expect(item?.authorDisplayName).toMatch(/P4 free/i);
        expect(item?.beatTitle).toBeTruthy();
        expect(item?.canPreview).toBe(true);
        expect(item?.canDownloadRaw).toBe(false);
        expect(item?.downloadLadder.map((i) => i.unlocked)).toEqual([
          true,
          false,
          false,
          false,
        ]);

        expect(buildTakeExportLadder("FREE").map((i) => i.unlocked)).toEqual([
          true,
          false,
          false,
          false,
        ]);
        expect(buildTakeExportLadder("BRONZE").map((i) => i.unlocked)).toEqual([
          true,
          true,
          false,
          false,
        ]);
        expect(buildTakeExportLadder("SILVER").map((i) => i.unlocked)).toEqual([
          true,
          true,
          true,
          false,
        ]);
        expect(buildTakeExportLadder("GOLD").map((i) => i.unlocked)).toEqual([
          true,
          true,
          true,
          true,
        ]);

        await expect(
          createOwnTakeDownloadSignedUrlFor(free.context, {
            takeId: session.takeId,
          }),
        ).rejects.toMatchObject({ message: expect.stringMatching(/GOLD/i) });

        const preview = await createOwnTakePreviewSignedUrlFor(free.context, {
          takeId: session.takeId,
        });
        expect(preview.url).toMatch(/^https?:\/\//);

        await expect(
          createOwnTakeDownloadSignedUrlFor(other.context, {
            takeId: session.takeId,
          }),
        ).rejects.toBeInstanceOf(AuthError);

        const goldBeat = await seedPublishedBeat(admin, fixtures, gold.userId, bytes, 60);
        const gSession = await createTakeRecordingSessionFor(gold.context, {
          beatId: goldBeat.beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
        });
        expect(
          (
            await gold.client.storage
              .from(TAKE_AUDIO_BUCKET)
              .uploadToSignedUrl(gSession.path, gSession.token, bytes, {
                contentType: "audio/wav",
                upsert: false,
              })
          ).error,
        ).toBeNull();
        await finalizeTakeRecordingFor(gold.context, {
          takeId: gSession.takeId,
        });

        const gDl = await createOwnTakeDownloadSignedUrlFor(gold.context, {
          takeId: gSession.takeId,
        });
        expect(gDl.url).toMatch(/^https?:\/\//);
        expect(gDl.url).not.toMatch(/\/storage\/v1\/object\/public\//);

        const { count: ledgerCount } = await admin
          .from("take_download_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", gold.userId)
          .eq("take_id", gSession.takeId);
        expect(ledgerCount ?? 0).toBeGreaterThanOrEqual(1);

        expect(isRenderJobTier("MP3_192")).toBe(true);
        expect(isMixRenderJobTier("MP3_192")).toBe(false);

        try {
          const job = await createTakeExportJobFor(gold.context, {
            takeId: gSession.takeId,
            quality: "MP3_128",
            idempotencyKey: `p4v-${gSession.takeId}-128`,
          });
          expect(job.kind).toBe("TAKE_EXPORT");
          expect(job.workerInfraStatus).toBe("BLOCKED_INFRA");
          await admin.from("render_jobs").delete().eq("id", job.id);
        } catch (e) {
          expect(e).toBeInstanceOf(RenderJobDomainError);
          expect((e as RenderJobDomainError).code).toBe("DISABLED");
        }
      } finally {
        await fixtures.cleanup();
      }
    },
    180_000,
  );
});

describe("P4 live gate", () => {
  it("documents live skip when env/fixtures missing", () => {
    if (!live) {
      expect(live).toBe(false);
    } else {
      expect(live).toBe(true);
    }
  });
});

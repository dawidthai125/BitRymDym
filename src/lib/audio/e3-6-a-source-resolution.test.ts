import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { buildAudioArtifactObjectKey } from "@/lib/audio/artifact-object-key";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  assertObjectKeyNotClientChosen,
  assertRenderBeatEligibleAtBake,
  assertRenderTakeEligibleAtBake,
  rejectClientRenderSourceClaims,
} from "@/lib/audio/render-source-core";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TAKE_ID = "33333333-3333-4333-8333-333333333333";
const BEAT_ID = "44444444-4444-4444-8444-444444444444";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const MIX_ID = "66666666-6666-4666-8666-666666666666";
const ASSET_ID = "77777777-7777-4777-8777-777777777777";

function readyTake(overrides: Record<string, unknown> = {}) {
  return {
    id: TAKE_ID,
    owner_id: OWNER,
    beat_id: BEAT_ID,
    status: "READY",
    object_key: buildUserTakeObjectKey({ ownerId: OWNER, takeId: TAKE_ID }),
    storage_bucket: TAKE_AUDIO_BUCKET,
    content_type: "audio/webm",
    duration_seconds: 30,
    byte_size: 1024,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function readyBeatAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    object_key: `beats/${BEAT_ID}/master.wav`,
    storage_bucket: BEAT_AUDIO_BUCKET,
    content_type: "audio/wav",
    byte_size: 2048,
    status: "READY",
    is_active: true,
    purpose: "MASTER",
    ...overrides,
  };
}

describe("E3.6-A — source resolution AuthZ (unit)", () => {
  it("rejects client object_key / URL / storage path claims", () => {
    expect(() =>
      rejectClientRenderSourceClaims({ object_key: "evil/path" }),
    ).toThrow(RenderJobDomainError);
    expect(() =>
      rejectClientRenderSourceClaims({ url: "https://evil.example/x" }),
    ).toThrow(/url/);
    expect(() =>
      rejectClientRenderSourceClaims({ signedUrl: "https://evil.example/x" }),
    ).toThrow();
    expect(() =>
      rejectClientRenderSourceClaims({ storage_path: "user/x" }),
    ).toThrow();
    expect(() =>
      rejectClientRenderSourceClaims({ takeObjectKey: "x" }),
    ).toThrow();
    expect(() =>
      rejectClientRenderSourceClaims({ beat_url: "https://x" }),
    ).toThrow();
    // jobId alone is fine
    expect(() =>
      rejectClientRenderSourceClaims({ jobId: JOB_ID }),
    ).not.toThrow();
  });

  it("DENY foreign take owner (IDOR)", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ owner_id: OTHER }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/does not belong to job owner/);
  });

  it("DENY deleted / expired / non-READY take (stale source)", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ deleted_at: new Date().toISOString() }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/deleted/);

    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/expired/);

    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ status: "UPLOADING" }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/not READY/);
  });

  it("DENY arbitrary / mismatched take object_key", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ object_key: "user/evil/takes/x/mic.bin" }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/object key/);
  });

  it("DENY take/beat binding mismatch", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ beat_id: OTHER }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT_ID,
      }),
    ).toThrow(/mix session beat/);
  });

  it("ALLOW eligible own READY take with canonical key", () => {
    const ref = assertRenderTakeEligibleAtBake({
      take: readyTake(),
      jobOwnerId: OWNER,
      expectedBeatId: BEAT_ID,
    });
    expect(ref.kind).toBe("take");
    expect(ref.storageBucket).toBe(TAKE_AUDIO_BUCKET);
    expect(ref.objectKey).toBe(
      buildUserTakeObjectKey({ ownerId: OWNER, takeId: TAKE_ID }),
    );
  });

  it("DENY beat not PLAYBACK-eligible", () => {
    expect(() =>
      assertRenderBeatEligibleAtBake({
        beatId: BEAT_ID,
        beatStatus: "DRAFT",
        actorRole: "USER",
        durationSeconds: 60,
        asset: readyBeatAsset(),
      }),
    ).toThrow(/not available for Mix playback/);
  });

  it("DENY beat asset wrong bucket / inactive / size limit", () => {
    expect(() =>
      assertRenderBeatEligibleAtBake({
        beatId: BEAT_ID,
        beatStatus: "PUBLISHED",
        actorRole: "USER",
        durationSeconds: 60,
        asset: readyBeatAsset({ storage_bucket: "take-audio" }),
      }),
    ).toThrow(/beat storage bucket/);

    expect(() =>
      assertRenderBeatEligibleAtBake({
        beatId: BEAT_ID,
        beatStatus: "PUBLISHED",
        actorRole: "USER",
        durationSeconds: 60,
        asset: readyBeatAsset({ is_active: false }),
      }),
    ).toThrow(/not READY/);

    expect(() =>
      assertRenderBeatEligibleAtBake({
        beatId: BEAT_ID,
        beatStatus: "PUBLISHED",
        actorRole: "USER",
        durationSeconds: 60,
        asset: readyBeatAsset({ byte_size: 51 * 1024 * 1024 }),
      }),
    ).toThrow(/size exceeds/);
  });

  it("ALLOW PUBLISHED beat with READY MASTER asset from DB key only", () => {
    const ref = assertRenderBeatEligibleAtBake({
      beatId: BEAT_ID,
      beatStatus: "PUBLISHED",
      actorRole: "USER",
      durationSeconds: 60,
      asset: readyBeatAsset(),
    });
    expect(ref.kind).toBe("beat");
    expect(ref.objectKey).toBe(`beats/${BEAT_ID}/master.wav`);
    expect(ref.storageBucket).toBe(BEAT_AUDIO_BUCKET);
  });

  it("DENY arbitrary artifact object_key vs canonical builder", () => {
    const canonical = buildAudioArtifactObjectKey({
      ownerId: OWNER,
      mixSessionId: MIX_ID,
      jobId: JOB_ID,
      tier: "BASIC_MP3",
    });
    expect(() =>
      assertObjectKeyNotClientChosen({
        candidate: "user/evil/mix/x/jobs/y/BASIC_MP3.mp3",
        allowedCanonical: canonical,
      }),
    ).toThrow(/arbitrary object_key/);
    expect(() =>
      assertObjectKeyNotClientChosen({
        candidate: canonical,
        allowedCanonical: canonical,
      }),
    ).not.toThrow();
  });
});

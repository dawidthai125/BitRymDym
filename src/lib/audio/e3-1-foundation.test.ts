import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  AUDIO_ARTIFACTS_BUCKET,
  AUDIO_ARTIFACT_QUOTA_FREE_BYTES,
  AUDIO_ARTIFACT_QUOTA_PREMIUM_BYTES,
  AUDIO_ARTIFACT_RETENTION_FREE_SECONDS,
  AUDIO_ARTIFACT_RETENTION_PREMIUM_SECONDS,
  AUDIO_CAPABILITY_KEYS,
  AUDIO_CODEC,
  AUDIO_RENDER_CONCURRENT_FREE,
  AUDIO_RENDER_CONCURRENT_PREMIUM,
  AUDIO_RENDER_FREE_RENDERS_PER_UTC_DAY,
  AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  AUDIO_RENDER_MAX_ATTEMPTS,
  AUDIO_RENDER_MAX_BEAT_BYTES,
  AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS,
  AUDIO_RENDER_MAX_TAKE_BYTES,
  AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY,
  E3_MIX_ENABLED,
  E3_PUBLIC_AUDIO,
  E3_RENDER_JOBS_ENABLED,
} from "@/config/audio-render";
import {
  buildAudioArtifactObjectKey,
  expectedAudioArtifactObjectKey,
  isAudioArtifactsBucket,
} from "@/lib/audio/artifact-object-key";
import {
  AUDIO_ARTIFACT_STATUSES,
  MIX_SESSION_STATUSES,
  RENDER_JOB_STATUSES,
  RENDER_JOB_TIERS,
} from "@/types/domain";

describe("E3.1 — audio foundation (unit)", () => {
  it("locks STANDARD anti-abuse caps from Final Architecture Lock", () => {
    expect(AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS).toBe(180);
    expect(AUDIO_RENDER_MAX_TAKE_BYTES).toBe(20 * 1024 * 1024);
    expect(AUDIO_RENDER_MAX_BEAT_BYTES).toBe(50 * 1024 * 1024);
    expect(AUDIO_RENDER_FREE_RENDERS_PER_UTC_DAY).toBe(5);
    expect(AUDIO_RENDER_PREMIUM_RENDERS_PER_UTC_DAY).toBe(30);
    expect(AUDIO_RENDER_CONCURRENT_FREE).toBe(1);
    expect(AUDIO_RENDER_CONCURRENT_PREMIUM).toBe(2);
    expect(AUDIO_RENDER_JOB_TIMEOUT_SECONDS).toBe(180);
    expect(AUDIO_RENDER_MAX_ATTEMPTS).toBe(3);
    expect(AUDIO_ARTIFACT_RETENTION_FREE_SECONDS).toBe(48 * 60 * 60);
    expect(AUDIO_ARTIFACT_RETENTION_PREMIUM_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(AUDIO_ARTIFACT_QUOTA_FREE_BYTES).toBe(250 * 1024 * 1024);
    expect(AUDIO_ARTIFACT_QUOTA_PREMIUM_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it("locks OAD-06 codec baseline (stereo MP3 + WAV)", () => {
    expect(AUDIO_CODEC.BASIC_MP3_BITRATE_KBPS).toBe(128);
    expect(AUDIO_CODEC.HQ_MP3_BITRATE_KBPS).toBe(320);
    expect(AUDIO_CODEC.WAV_SAMPLE_RATE).toBe(44100);
    expect(AUDIO_CODEC.WAV_BIT_DEPTH).toBe(16);
    expect(AUDIO_CODEC.CHANNELS).toBe(2);
  });

  it("defaults public audio OFF and does not treat mix/jobs flags as public", () => {
    expect(E3_PUBLIC_AUDIO).toBe(false);
    expect(E3_MIX_ENABLED).toBe(false);
    expect(E3_RENDER_JOBS_ENABLED).toBe(false);
  });

  it("exposes frozen capability keys without STEMS", () => {
    expect(AUDIO_CAPABILITY_KEYS).toEqual([
      "MIX_BASIC",
      "MIX_PRO",
      "MASTER_BASIC",
      "MASTER_PRO",
      "EXPORT_BASIC_MP3",
      "EXPORT_HQ_MP3",
      "EXPORT_WAV",
    ]);
    expect(AUDIO_CAPABILITY_KEYS.join(",")).not.toMatch(/STEM/i);
  });

  it("uses dedicated audio-artifacts bucket", () => {
    expect(AUDIO_ARTIFACTS_BUCKET).toBe("audio-artifacts");
    expect(isAudioArtifactsBucket("audio-artifacts")).toBe(true);
    expect(isAudioArtifactsBucket("take-audio")).toBe(false);
    expect(isAudioArtifactsBucket("beat-audio")).toBe(false);
  });

  it("builds canonical artifact object keys", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const mixSessionId = "22222222-2222-4222-8222-222222222222";
    const jobId = "33333333-3333-4333-8333-333333333333";
    expect(
      buildAudioArtifactObjectKey({
        ownerId,
        mixSessionId,
        jobId,
        tier: "BASIC_MP3",
      }),
    ).toBe(
      `user/${ownerId}/mix/${mixSessionId}/jobs/${jobId}/BASIC_MP3.mp3`,
    );
    expect(
      buildAudioArtifactObjectKey({
        ownerId,
        mixSessionId,
        jobId,
        tier: "WAV",
      }),
    ).toBe(`user/${ownerId}/mix/${mixSessionId}/jobs/${jobId}/WAV.wav`);
    expect(
      expectedAudioArtifactObjectKey({
        ownerId,
        mixSessionId,
        jobId,
        tier: "HQ_MP3",
        objectKey: `user/${ownerId}/mix/${mixSessionId}/jobs/${jobId}/HQ_MP3.mp3`,
      }),
    ).toBe(true);
  });

  it("rejects spoofed path segments in artifact keys", () => {
    expect(() =>
      buildAudioArtifactObjectKey({
        ownerId: "../x",
        mixSessionId: "22222222-2222-4222-8222-222222222222",
        jobId: "33333333-3333-4333-8333-333333333333",
        tier: "BASIC_MP3",
      }),
    ).toThrow(/uuid/i);
  });

  it("exposes E3.1 domain enums", () => {
    expect(MIX_SESSION_STATUSES).toEqual([
      "DRAFT",
      "READY_TO_RENDER",
      "SOURCE_UNAVAILABLE",
    ]);
    expect(RENDER_JOB_STATUSES).toEqual([
      "QUEUED",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "TIMEOUT",
    ]);
    expect(RENDER_JOB_TIERS).toEqual(["BASIC_MP3", "HQ_MP3", "WAV"]);
    expect(AUDIO_ARTIFACT_STATUSES).toEqual([
      "READY",
      "FAILED",
      "EXPIRED",
      "DELETED",
    ]);
  });

  it("migration defines E3.1 tables, RLS, bucket; no artifact_kind; no D02/takes rewrite", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260928200000_e3_1_audio_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE public\.premium_entitlements/);
    expect(sql).toMatch(/expires_at/);
    expect(sql).toMatch(/CREATE TABLE public\.mix_sessions/);
    expect(sql).toMatch(/CREATE TABLE public\.render_jobs/);
    expect(sql).toMatch(/CREATE TABLE public\.audio_artifacts/);
    expect(sql).toMatch(/audio-artifacts/);
    expect(sql).toMatch(/premium_entitlements_select_own/);
    expect(sql).toMatch(/mix_sessions_select_own/);
    expect(sql).toMatch(/Only service_role may mutate/);
    expect(sql).not.toMatch(/artifact_kind\s/);
    expect(sql).not.toMatch(/CREATE TABLE public\.takes/);
    expect(sql).not.toMatch(/brd_tk_aid/);
    expect(sql).not.toMatch(/beat_access_grants/);
    expect(sql).toMatch(/STEMS deferred/);
  });
});

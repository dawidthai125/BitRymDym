import { describe, expect, it } from "vitest";

import {
  BEAT_AUDIO_DOWNLOAD_TTL_SECONDS,
  BEAT_AUDIO_MAX_BYTES,
  BEAT_AUDIO_PLAYBACK_TTL_SECONDS,
  buildBeatAudioObjectKey,
  canDownloadOriginalBeatMaster,
  canRequestBeatAudioAccess,
  signedUrlTtlSeconds,
  validateAudioUploadMeta,
  validateObjectKey,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";

describe("resolveAudioContentType", () => {
  it("prefers valid File.type", () => {
    expect(
      resolveAudioContentType({
        fileType: "audio/wav",
        filename: "x.mp3",
      }),
    ).toBe("audio/wav");
  });

  it("falls back to extension when type empty", () => {
    expect(
      resolveAudioContentType({ fileType: "", filename: "loop.flac" }),
    ).toBe("audio/flac");
    expect(
      resolveAudioContentType({ fileType: null, filename: "a.wav" }),
    ).toBe("audio/wav");
  });

  it("returns null for unknown type/extension", () => {
    expect(
      resolveAudioContentType({ fileType: "", filename: "x.txt" }),
    ).toBeNull();
  });
});

describe("beat audio validation (Phase 1.5)", () => {
  it("builds opaque .bin object keys only", () => {
    const key = buildBeatAudioObjectKey({
      beatId: "11111111-1111-1111-1111-111111111111",
      assetId: "22222222-2222-2222-2222-222222222222",
      purpose: "MASTER",
    });
    expect(key.endsWith(".bin")).toBe(true);
    expect(key.includes(".mp3")).toBe(false);
    expect(validateObjectKey(key)).toBeNull();
    expect(validateObjectKey(key.replace(/\.bin$/, ".mp3"))).not.toBeNull();
  });

  it("enforces interim MIME allow-list and 50 MiB cap", () => {
    expect(
      validateAudioUploadMeta({
        contentType: "audio/mpeg",
        byteSize: 1024,
      }).ok,
    ).toBe(true);
    expect(
      validateAudioUploadMeta({
        contentType: "application/octet-stream",
        byteSize: 1024,
      }).ok,
    ).toBe(false);
    expect(
      validateAudioUploadMeta({
        contentType: "audio/mpeg",
        byteSize: BEAT_AUDIO_MAX_BYTES + 1,
      }).ok,
    ).toBe(false);
  });

  it("freezes signed URL TTLs", () => {
    expect(signedUrlTtlSeconds("PLAYBACK")).toBe(
      BEAT_AUDIO_PLAYBACK_TTL_SECONDS,
    );
    expect(signedUrlTtlSeconds("DOWNLOAD")).toBe(
      BEAT_AUDIO_DOWNLOAD_TTL_SECONDS,
    );
    expect(BEAT_AUDIO_PLAYBACK_TTL_SECONDS).toBe(120);
    expect(BEAT_AUDIO_DOWNLOAD_TTL_SECONDS).toBe(300);
  });
});

describe("beat audio access gate rules", () => {
  it("allows anon PLAYBACK for PUBLISHED; DOWNLOAD only for USER-owned", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "DRAFT",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
  });

  it("allows USER published USER-owned download; denies PLATFORM", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "DRAFT",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
  });

  it("allows MODERATOR playback on non-published but denies download", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "MODERATOR",
        beatStatus: "DRAFT",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "MODERATOR",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(false);
  });

  it("ADMIN user-facing DOWNLOAD: USER-owned ALLOW, PLATFORM DENY", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ADMIN",
        beatStatus: "DRAFT",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canDownloadOriginalBeatMaster({
        actor: "ADMIN",
        beatStatus: "PUBLISHED",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  SAMPLE_CAP,
  SAMPLE_FORBIDDEN,
  SAMPLE_INVALID,
  SAMPLE_RIGHTS_REQUIRED,
  buildUserSampleObjectKey,
  catalogDurationSeconds,
  evaluateSampleAudioMeta,
  evaluateSampleCreate,
  evaluateSampleDelete,
  evaluateSampleReview,
  evaluateSampleSubmit,
  sampleObjectKeyMatches,
} from "@/lib/studio/samples/sample-policy";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("studio sample policy", () => {
  it("keeps the private object key off the catalog prefix", () => {
    const key = buildUserSampleObjectKey(ID);
    expect(key).toBe(`user-samples/${ID}/original.bin`);
    expect(key.startsWith("catalog/")).toBe(false);
    expect(sampleObjectKeyMatches(ID, key)).toBe(true);
    expect(sampleObjectKeyMatches(ID, `catalog/${ID}/original.bin`)).toBe(false);
  });

  it("requires rights and stops at 30 samples", () => {
    expect(evaluateSampleCreate({ rightsAccepted: false, ownedCount: 0 })).toMatchObject({
      ok: false,
      error: SAMPLE_RIGHTS_REQUIRED,
    });
    expect(evaluateSampleCreate({ rightsAccepted: true, ownedCount: 30 })).toMatchObject({
      ok: false,
      error: SAMPLE_CAP,
    });
    expect(evaluateSampleCreate({ rightsAccepted: true, ownedCount: 29 }).ok).toBe(true);
  });

  it("rejects audio outside 1–30 seconds and 8 MB", () => {
    expect(
      evaluateSampleAudioMeta({
        byteSize: 1000,
        durationMs: 999,
        contentType: "audio/wav",
      }),
    ).toMatchObject({ ok: false, error: SAMPLE_INVALID });
    expect(
      evaluateSampleAudioMeta({
        byteSize: 8 * 1024 * 1024 + 1,
        durationMs: 1000,
        contentType: "audio/wav",
      }).ok,
    ).toBe(false);
    expect(
      evaluateSampleAudioMeta({
        byteSize: 2000,
        durationMs: 2000,
        contentType: "audio/wav",
      }).ok,
    ).toBe(true);
  });

  it("lets the owner submit a private sample and blocks a stranger", () => {
    expect(
      evaluateSampleSubmit({ status: "PRIVATE", rightsAccepted: true, owner: false }),
    ).toMatchObject({ error: SAMPLE_FORBIDDEN });
    expect(
      evaluateSampleSubmit({ status: "PUBLISHED", rightsAccepted: true, owner: true }).ok,
    ).toBe(false);
    expect(
      evaluateSampleSubmit({ status: "REJECTED", rightsAccepted: true, owner: true }).ok,
    ).toBe(true);
  });

  it("publishes only a pending sample that has a rights confirmation", () => {
    expect(
      evaluateSampleReview({
        status: "PRIVATE",
        rightsAccepted: true,
        action: "approve",
      }).ok,
    ).toBe(false);
    expect(
      evaluateSampleReview({
        status: "PENDING_REVIEW",
        rightsAccepted: false,
        action: "approve",
      }),
    ).toMatchObject({ error: SAMPLE_RIGHTS_REQUIRED });
    expect(
      evaluateSampleReview({
        status: "PENDING_REVIEW",
        rightsAccepted: true,
        action: "approve",
      }).ok,
    ).toBe(true);
    expect(
      evaluateSampleReview({
        status: "PENDING_REVIEW",
        rightsAccepted: true,
        action: "reject",
      }).ok,
    ).toBe(true);
  });

  it("allows delete only for a private or rejected sample owned by the user", () => {
    expect(evaluateSampleDelete({ status: "PENDING_REVIEW", owner: true }).ok).toBe(false);
    expect(evaluateSampleDelete({ status: "PUBLISHED", owner: true }).ok).toBe(false);
    expect(evaluateSampleDelete({ status: "PRIVATE", owner: false })).toMatchObject({
      error: SAMPLE_FORBIDDEN,
    });
    expect(evaluateSampleDelete({ status: "PRIVATE", owner: true }).ok).toBe(true);
  });

  it("rounds catalog duration into the existing 1–180 second gate", () => {
    expect(catalogDurationSeconds(1500)).toBe(2);
    expect(catalogDurationSeconds(1000)).toBe(1);
    expect(catalogDurationSeconds(30_000)).toBe(30);
  });
});

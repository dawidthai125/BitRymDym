import { describe, expect, it } from "vitest";

import {
  CREATOR_EXPERIENCE_AMOUNTS,
  CREATOR_EXPERIENCE_DAILY_CAPS,
  idempotencyKeyFor,
} from "@/config/creator-experience";

describe("Creator Progress W1 award config anti-abuse", () => {
  it("uses stable idempotency keys (duplicate approval / publish / retry)", () => {
    expect(idempotencyKeyFor("BEAT_APPROVED", "beat-1")).toBe(
      "beat_approved:beat-1",
    );
    expect(idempotencyKeyFor("BEAT_APPROVED", "beat-1")).toBe(
      idempotencyKeyFor("BEAT_APPROVED", "beat-1"),
    );
    expect(idempotencyKeyFor("BEAT_FIRST_PUBLISHED", "beat-1")).toBe(
      "beat_first_published:beat-1",
    );
    expect(idempotencyKeyFor("RENDER_SUCCEEDED", "job-9")).toBe(
      "render_succeeded:job-9",
    );
    expect(idempotencyKeyFor("MIX_SESSION_FIRST_EXPORT", "sess-1")).toBe(
      "mix_first_export:sess-1",
    );
    expect(idempotencyKeyFor("TAKE_READY", "take-1")).toBe("take_ready:take-1");
    expect(idempotencyKeyFor("PROFILE_COMPLETED", "user-1")).toBe(
      "profile_completed:user-1",
    );
  });

  it("keeps republish/retry as same subject keys (second award blocked by DB unique)", () => {
    const first = idempotencyKeyFor("BEAT_FIRST_PUBLISHED", "beat-x");
    const republish = idempotencyKeyFor("BEAT_FIRST_PUBLISHED", "beat-x");
    expect(first).toBe(republish);
    const job = idempotencyKeyFor("RENDER_SUCCEEDED", "job-x");
    const retry = idempotencyKeyFor("RENDER_SUCCEEDED", "job-x");
    expect(job).toBe(retry);
  });

  it("enforces daily caps for render/take only", () => {
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.RENDER_SUCCEEDED).toBe(2);
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.TAKE_READY).toBe(3);
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.BEAT_APPROVED).toBeUndefined();
    expect(CREATOR_EXPERIENCE_DAILY_CAPS.PROFILE_COMPLETED).toBeUndefined();
  });

  it("does not define listen/download experience amounts", () => {
    const keys = Object.keys(CREATOR_EXPERIENCE_AMOUNTS);
    expect(keys).not.toContain("LISTEN");
    expect(keys).not.toContain("DOWNLOAD");
    expect(keys).not.toContain("PREVIEW");
  });
});

import { describe, expect, it } from "vitest";

import { BEAT_AUDIO_DOWNLOAD_TTL_SECONDS } from "@/lib/beats/audio-validation";
import { canRequestBeatAudioAccess } from "@/lib/beats/audio-validation";

describe("Phase 1.8A download AuthZ regression", () => {
  it("keeps DOWNLOAD TTL at 300s", () => {
    expect(BEAT_AUDIO_DOWNLOAD_TTL_SECONDS).toBe(300);
  });

  it("allows ANON/USER DOWNLOAD only for PUBLISHED", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "DRAFT",
        purpose: "DOWNLOAD",
      }),
    ).toBe(false);
  });

  it("denies MODERATOR DOWNLOAD; allows ADMIN", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "MODERATOR",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ADMIN",
        beatStatus: "DRAFT",
        purpose: "DOWNLOAD",
      }),
    ).toBe(true);
  });
});

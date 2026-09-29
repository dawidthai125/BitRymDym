import { describe, expect, it } from "vitest";

import { buildAudioArtifactObjectKey } from "@/lib/audio/artifact-object-key";
import { capabilityForRenderTier } from "@/lib/audio/render-job-core";

describe("E3.7-E — Premium worker / artifact key contracts", () => {
  it("object keys distinguish BASIC / HQ / WAV", () => {
    const base = {
      ownerId: "11111111-1111-4111-8111-111111111111",
      mixSessionId: "22222222-2222-4222-8222-222222222222",
      jobId: "33333333-3333-4333-8333-333333333333",
    };
    const basic = buildAudioArtifactObjectKey({ ...base, tier: "BASIC_MP3" });
    const hq = buildAudioArtifactObjectKey({ ...base, tier: "HQ_MP3" });
    const wav = buildAudioArtifactObjectKey({ ...base, tier: "WAV" });
    expect(basic.endsWith("/BASIC_MP3.mp3")).toBe(true);
    expect(hq.endsWith("/HQ_MP3.mp3")).toBe(true);
    expect(wav.endsWith("/WAV.wav")).toBe(true);
    expect(new Set([basic, hq, wav]).size).toBe(3);
  });

  it("tier → export capability mapping for worker AuthZ surface", () => {
    expect(capabilityForRenderTier("BASIC_MP3")).toBe("EXPORT_BASIC_MP3");
    expect(capabilityForRenderTier("HQ_MP3")).toBe("EXPORT_HQ_MP3");
    expect(capabilityForRenderTier("WAV")).toBe("EXPORT_WAV");
  });
});

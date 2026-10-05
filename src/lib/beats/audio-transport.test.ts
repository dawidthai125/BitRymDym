import { describe, expect, it } from "vitest";

import { resolveCreateBpm } from "@/lib/beats/bpm-uncertainty";
import {
  BEAT_AUDIO_MAX_BYTES,
  validateAudioUploadMeta,
} from "@/lib/beats/audio-validation";
import {
  PROVISIONAL_DRAFT_BPM,
  PROVISIONAL_DRAFT_DURATION_SECONDS,
} from "@/lib/beats/audio-transport";
import { analyzeAdminBeatAudioAction } from "@/lib/beats/create-with-master";
import { uploadPlatformBeatAudioAction } from "@/lib/beats/audio-actions";

describe("audio transport contracts (V1)", () => {
  it("provisional draft placeholders are valid domain integers", () => {
    expect(PROVISIONAL_DRAFT_BPM).toBe(1);
    expect(PROVISIONAL_DRAFT_DURATION_SECONDS).toBe(1);
  });

  it("domain still allows up to 50 MiB and rejects above", () => {
    expect(
      validateAudioUploadMeta({
        contentType: "audio/wav",
        byteSize: BEAT_AUDIO_MAX_BYTES,
      }).ok,
    ).toBe(true);
    expect(
      validateAudioUploadMeta({
        contentType: "audio/wav",
        byteSize: BEAT_AUDIO_MAX_BYTES + 1,
      }).ok,
    ).toBe(false);
  });

  it("rejects legacy base64 analyze Server Action", async () => {
    const r = await analyzeAdminBeatAudioAction({
      base64: "AAAA",
      contentType: "audio/wav",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/binary upload|signed/i);
  });

  it("rejects legacy base64 MASTER upload Server Action", async () => {
    const r = await uploadPlatformBeatAudioAction({
      beatId: "00000000-0000-0000-0000-000000000001",
      base64: "AAAA",
      contentType: "audio/mpeg",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/binary upload|signed/i);
  });

  it("create policy still rejects mismatch without override", () => {
    const r = resolveCreateBpm({
      clientBpm: 90,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("create policy rejects override outside server allowlist", () => {
    const r = resolveCreateBpm({
      clientBpm: 128,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";

import {
  rememberStudioBeatAudioSourceKey,
  resetStudioBeatSessionKeysForTests,
} from "@/lib/studio/studio-beat-session-source";
import {
  shouldReuseStudioVoice,
  studioClipSourceIdentity,
} from "@/lib/studio/studio-voice-identity";

afterEach(() => {
  resetStudioBeatSessionKeysForTests();
});

describe("WAVE 1.1 studio voice identity", () => {
  it("beat identity follows remembered asset key", () => {
    const clip = {
      sourceKind: "BEAT_REF" as const,
      sourceBeatId: "B1",
      sourceTakeId: null,
    };
    expect(studioClipSourceIdentity(clip)).toBeNull();
    rememberStudioBeatAudioSourceKey("B1", "beat:B1|A1");
    expect(studioClipSourceIdentity(clip)).toBe("beat:B1|A1");
    rememberStudioBeatAudioSourceKey("B1", "beat:B1|A2");
    expect(studioClipSourceIdentity(clip)).toBe("beat:B1|A2");
  });

  it("take identity is take:id", () => {
    expect(
      studioClipSourceIdentity({
        sourceKind: "TAKE",
        sourceBeatId: null,
        sourceTakeId: "t9",
      }),
    ).toBe("take:t9");
  });

  it("reuse voice only when identity matches", () => {
    expect(
      shouldReuseStudioVoice({
        existingIdentityKey: "beat:B1|A1",
        nextIdentityKey: "beat:B1|A1",
      }),
    ).toBe(true);
    expect(
      shouldReuseStudioVoice({
        existingIdentityKey: "beat:B1|A1",
        nextIdentityKey: "beat:B1|A2",
      }),
    ).toBe(false);
    expect(
      shouldReuseStudioVoice({
        existingIdentityKey: "beat:B1|A1",
        nextIdentityKey: null,
      }),
    ).toBe(false);
  });

  it("sticky A1 must not reuse after master becomes A2", () => {
    rememberStudioBeatAudioSourceKey("B1", "beat:B1|A1");
    const existing = studioClipSourceIdentity({
      sourceKind: "BEAT_REF",
      sourceBeatId: "B1",
      sourceTakeId: null,
    });
    rememberStudioBeatAudioSourceKey("B1", "beat:B1|A2");
    const next = studioClipSourceIdentity({
      sourceKind: "BEAT_REF",
      sourceBeatId: "B1",
      sourceTakeId: null,
    });
    expect(
      shouldReuseStudioVoice({
        existingIdentityKey: existing,
        nextIdentityKey: next,
      }),
    ).toBe(false);
  });
});

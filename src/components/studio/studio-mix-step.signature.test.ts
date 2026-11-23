import { describe, expect, it } from "vitest";

import { localizeNumberText, studioMixSignature } from "@/components/studio/studio-mix-step";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const doc = (clip: Record<string, unknown> = {}, track: Record<string, unknown> = {}, markers: unknown[] = []) =>
  ({
    project: { masterGainDb: 0, masterPan: 0, masterFxChain: { schemaVersion: 1, effects: [] } },
    tracks: [{ id: "t", gainDb: 0, pan: 0, muted: false, solo: false, trackRole: "lead_vocal", effectsChain: { schemaVersion: 1, effects: [] }, ...track }],
    clips: [{ id: "c", trackId: "t", timelineStartMs: 0, durationMs: 1000, sourceOffsetMs: 0, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0, ...clip }],
    markers,
  }) as unknown as StudioProjectDocument;

describe("mix analysis freshness (M26)", () => {
  it.each([
    ["tempo", doc({ stretchRatio: 1.2 })],
    ["pitch", doc({ pitchCents: 100 })],
    ["reverse", doc({ scratchReverse: true })],
    ["scratch", doc({ scratchRate: 2 })],
    ["automation", doc({}, { automation: { v: 1, lanes: [] } })],
    ["notes", doc({}, { midi: { v: 1, instrument: "sine", notes: [{ t: 0, dur: 1, pitch: 60, vel: 1 }] } })],
    ["markers", doc({}, {}, [{ id: "m", kind: "hook", positionMs: 5 }])],
  ])("%s makes the analysis stale", (_name, changed) => {
    expect(studioMixSignature(changed)).not.toBe(studioMixSignature(doc()));
  });
  it("defaults written explicitly are the same mix", () => {
    expect(studioMixSignature(doc({ stretchRatio: 1, pitchCents: 0, scratchReverse: false, scratchRate: 1 }))).toBe(studioMixSignature(doc()));
  });
  it("numbers in Polish use a comma", () => {
    expect(localizeNumberText("−9.3 LUFS", "pl")).toBe("−9,3 LUFS");
    expect(localizeNumberText("−9.3 LUFS", "en")).toBe("−9.3 LUFS");
  });
});

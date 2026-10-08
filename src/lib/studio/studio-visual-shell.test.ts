/**
 * Studio Visual Shell Pass — presentation contracts (OD-VS-01…05).
 * Does not reopen Phase 7.1.6 / invent P7.1.7.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const mixControl = readFileSync(
  join(root, "src/components/studio/studio-mix-control.tsx"),
  "utf8",
);

describe("Studio Visual Shell — Transport", () => {
  it("exposes Record affordance + disabled Loop/Metronome slots", () => {
    expect(editor).toMatch(/data-testid="studio-transport-record"/);
    expect(editor).toMatch(/data-testid="studio-transport-loop"/);
    expect(editor).toMatch(/data-testid="studio-transport-metronome"/);
    expect(editor).toMatch(/Loop — niedostępne/);
    expect(editor).toMatch(/Metronom — niedostępne/);
    expect(editor).toMatch(/setInspectorPreferRecord\(true\)/);
  });

  it("shows BPM / signature / duration / master / save / export deep-link", () => {
    expect(editor).toMatch(/data-testid="studio-transport-meta"/);
    expect(editor).toMatch(/data-testid="studio-transport-master"/);
    expect(editor).toMatch(/data-testid="studio-transport-save"/);
    expect(editor).toMatch(/data-testid="studio-transport-export"/);
    expect(editor).toMatch(/STUDIO_EXPORT_DEEP_LINK_HREF/);
    expect(editor).toMatch(/href=\{STUDIO_EXPORT_DEEP_LINK_HREF\}/);
    expect(editor).toMatch(/\/account\/takes/);
    expect(editor).toMatch(/patchMasterMix\(\{ masterGainDb \}\)/);
  });

  it("does not implement Loop/Metronome runtime state", () => {
    expect(editor).not.toMatch(/loopEnabled|metronomeEnabled|clickTrack/);
    expect(editor).not.toMatch(/createOscillator|AudioWorklet.*metro/i);
  });
});

describe("Studio Visual Shell — Tracks / Mixer / Inspector", () => {
  it("track headers expose compact vol/pan via patchTrack", () => {
    expect(editor).toMatch(/data-testid="studio-track-header-mix"/);
    expect(editor).toMatch(/patchTrack\(track\.id, \{ gainDb \}\)/);
    expect(editor).toMatch(/patchTrack\(track\.id, \{ pan \}\)/);
  });

  it("mixer M/S/R mirrors patchTrack — no second store", () => {
    expect(editor).toMatch(/data-testid="studio-mix-track-msr"/);
    expect(editor).not.toMatch(/MixerMuteStore|createMixerSelection/);
  });

  it("inspector visual tabs map to existing context / FxSheet — no InspectorTab SSOT", () => {
    expect(editor).toMatch(/data-testid="studio-inspector-visual-tabs"/);
    expect(editor).toMatch(/deriveStudioInspectorContext/);
    expect(editor).not.toMatch(/type InspectorTab/);
    expect(editor).not.toMatch(/useState<\s*InspectorTab/);
  });

  it("mix control supports vertical orientation without new audio nodes", () => {
    expect(mixControl).toMatch(/orientation\?: \"horizontal\" \| \"vertical\"/);
    expect(mixControl).toMatch(/writingMode/);
    expect(mixControl).not.toMatch(/AudioContext|GainNode|createGain/);
  });
});

describe("Studio Visual Shell — architecture guards", () => {
  it("does not invent second engine / AC / persist / CAS", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    // Existing orchestrator construction remains the single persist owner.
    expect(editor).toMatch(/new StudioPersistOrchestrator\(/);
    expect(
      (editor.match(/new StudioPersistOrchestrator\(/g) ?? []).length,
    ).toBe(1);
    expect(editor).toMatch(/expectedDocumentVersion/);
  });
});

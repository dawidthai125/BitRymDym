/**
 * Studio Visual Parity V2 — presentation contracts (freeze).
 * Does not invent P7.1.7 / new audio / persist systems.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);

describe("Studio Visual Parity V2 — transport empty shell", () => {
  it("keeps full transport chrome in noBeat (not message-only strip)", () => {
    expect(editor).toMatch(/data-studio-visual-parity="v2"/);
    expect(editor).toMatch(/data-studio-transport-empty=\{noBeat \? "true" : "false"\}/);
    expect(editor).toMatch(/data-testid="studio-transport-ops"/);
    expect(editor).toMatch(/data-testid="studio-transport-meta"/);
    expect(editor).toMatch(/data-testid="studio-transport-master"/);
    expect(editor).toMatch(/data-testid="studio-transport-save"/);
    expect(editor).toMatch(/data-testid="studio-transport-export"/);
    expect(editor).toMatch(/data-testid="studio-transport-choose-beat"/);
    expect(editor).toMatch(/data-testid="studio-transport-nobeat-status"/);
    // Must not use exclusive noBeat strip that omits ops chrome.
    expect(editor).not.toMatch(
      /noBeat \? \(\s*<div className="flex flex-wrap items-center gap-2 py-1">/,
    );
  });

  it("disables playback/record when noBeat; Loop/Metronome remain disabled placeholders", () => {
    expect(editor).toMatch(/disabled=\{beatControlsDisabled \|\| phase === "playing"\}/);
    expect(editor).toMatch(/disabled=\{noBeat \|\| phase !== "playing"\}/);
    expect(editor).toMatch(/disabled=\{noBeat\}/);
    expect(editor).toMatch(/data-testid="studio-transport-loop"/);
    expect(editor).toMatch(/data-testid="studio-transport-metronome"/);
    expect(editor).toMatch(/Loop — niedostępne/);
    expect(editor).toMatch(/Metronom — niedostępne/);
    expect(editor).not.toMatch(/loopEnabled|metronomeEnabled/);
  });
});

describe("Studio Visual Parity V2 — mixer default", () => {
  it("expands mixer by default on xl via matchMedia", () => {
    expect(editor).toMatch(/min-width: 1280px/);
    expect(editor).toMatch(/setMixerOpen\(true\)/);
    expect(editor).toMatch(/Visual Parity V2 — Mixer Contract C/);
    expect(editor).toMatch(/inspectorDesktopRail && mixerOpen/);
    expect(editor).toMatch(/mixerOpen && !inspectorDesktopRail/);
  });
});

describe("Studio Visual Parity V2 — architecture", () => {
  it("does not invent second engine / AC / persist", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(editor).not.toMatch(/PlayerProvider/);
    expect(
      (editor.match(/new StudioPersistOrchestrator\(/g) ?? []).length,
    ).toBe(1);
    expect(editor).toMatch(/expectedDocumentVersion/);
  });
});

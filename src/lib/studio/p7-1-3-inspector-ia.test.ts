/**
 * Phase 7.1.3 — Inspector IA contracts (OD-P7.1-02 = B + OD-P7.1.3-01..04).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveStudioInspectorContext,
  studioInspectorContextTitle,
} from "@/components/studio/studio-inspector-context";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const recording = readFileSync(
  join(root, "src/components/studio/studio-recording-panel.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(root, "src/components/studio/studio-inspector-shell.tsx"),
  "utf8",
);
const tokensTest = readFileSync(
  join(root, "src/lib/studio/p7-1-2-tokens.test.ts"),
  "utf8",
);
const shellTest = readFileSync(
  join(root, "src/lib/studio/p7-1-1-shell.test.ts"),
  "utf8",
);

describe("Phase 7.1.3 derived context priority", () => {
  it("record > clip > track > empty", () => {
    expect(
      deriveStudioInspectorContext({
        recordingActive: true,
        selectedClipId: "c1",
        selectedTrackId: "t1",
      }),
    ).toBe("record");
    expect(
      deriveStudioInspectorContext({
        recordingActive: false,
        selectedClipId: "c1",
        selectedTrackId: "t1",
      }),
    ).toBe("clip");
    expect(
      deriveStudioInspectorContext({
        recordingActive: false,
        selectedClipId: null,
        selectedTrackId: "t1",
      }),
    ).toBe("track");
    expect(
      deriveStudioInspectorContext({
        recordingActive: false,
        selectedClipId: null,
        selectedTrackId: null,
      }),
    ).toBe("empty");
  });

  it("exposes Polish context titles", () => {
    expect(studioInspectorContextTitle("record")).toBe("Nagrywanie");
    expect(studioInspectorContextTitle("clip")).toBe("Klip / plik");
    expect(studioInspectorContextTitle("track")).toBe("Ścieżka");
    expect(studioInspectorContextTitle("empty")).toBe("Inspector");
  });
});

describe("Phase 7.1.3 editor IA wiring", () => {
  it("derives context from selection SSOT — no second selection store", () => {
    expect(editor).toMatch(/deriveStudioInspectorContext/);
    expect(editor).toMatch(/selectedTrackId/);
    expect(editor).toMatch(/selectedClipId/);
    expect(editor).not.toMatch(/createContext\(\s*\{[^}]*selectedTrack/);
    expect(editor).not.toMatch(/InspectorTab/);
    expect(editor).not.toMatch(/\["settings", "Ustawienia"\]/);
  });

  it("removes always-on Effects top tab; FX entry from Track Inspector", () => {
    expect(editor).toMatch(/studio-inspector-track-fx/);
    expect(editor).toMatch(/StudioFxSheet/);
    expect(editor).not.toMatch(/\["effects", "Efekty"\]/);
  });

  it("renders Track / Clip / Empty / Record surfaces", () => {
    expect(editor).toMatch(/studio-inspector-track/);
    expect(editor).toMatch(/studio-inspector-clip/);
    expect(editor).toMatch(/studio-inspector-clip-source/);
    expect(editor).toMatch(/studio-inspector-empty/);
    expect(editor).toMatch(/StudioRecordingPanel/);
    expect(editor).toMatch(/preferredTrackId=\{activeSelectedTrackId\}/);
  });

  it("syncs recording preferredTrackId without third store", () => {
    expect(recording).toMatch(/preferredTrackId/);
    expect(recording).toMatch(/manualForPreferred/);
    expect(recording).toMatch(/preferredTrackId \?\? null/);
  });

  it("mobile/tablet overlay has a11y dialog contract", () => {
    expect(shell).toMatch(/aria-modal="true"/);
    expect(shell).toMatch(/role="dialog"/);
    expect(shell).toMatch(/studio-inspector-backdrop/);
    expect(shell).toMatch(/Escape/);
    expect(shell).toMatch(/safe-area-inset-bottom/);
    expect(shell).toMatch(/min-h-11/);
  });

  it("implements Inspector↔Mixer XOR on overlay open", () => {
    expect(editor).toMatch(/function openInspectorOverlay/);
    expect(editor).toMatch(/function openMixerSurface/);
    expect(editor).toMatch(/setMixerOpen\(false\)/);
    expect(editor).toMatch(/setInspectorOverlayOpen\(false\)/);
    // Track select must not auto-open overlay (OD-P7.1.3-04 = B).
    const headerSelect = editor.slice(
      editor.indexOf('data-testid="studio-track-header-select"'),
      editor.indexOf('data-testid="studio-track-header-select"') + 500,
    );
    expect(headerSelect).toMatch(/setSelectedTrackId/);
    expect(headerSelect).not.toMatch(/openInspectorOverlay/);
  });

  it("preserves 7.1.1 landmarks and 7.1.2 tokens contracts", () => {
    expect(shellTest).toMatch(/studio-daw-shell/);
    expect(tokensTest).toMatch(/Source_Serif_4/);
    expect(editor).toMatch(/data-testid="studio-inspector-desktop"/);
    expect(editor).toMatch(/data-testid="studio-daw-shell"/);
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
  });
});

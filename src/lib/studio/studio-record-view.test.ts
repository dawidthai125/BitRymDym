import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { studioAdvancedRecordAllowed, studioRecordView } from "@/lib/studio/studio-record-view";

describe("studioRecordView", () => {
  it("opens the record step in the simple surface", () => {
    expect(studioRecordView({ step: "record", fullView: false })).toBe("simple");
  });

  it("keeps mix and mastering on the full surface", () => {
    expect(studioRecordView({ step: "mix", fullView: false, advancedAllowed: false })).toBe("full");
    expect(studioRecordView({ step: "master", fullView: false, advancedAllowed: false })).toBe("full");
  });

  it("restores the record step when full view is on", () => {
    expect(studioRecordView({ step: "record", fullView: true, advancedAllowed: true })).toBe("full");
  });

  it("keeps Free and Bronze on the simple record surface", () => {
    expect(studioAdvancedRecordAllowed("FREE")).toBe(false);
    expect(studioAdvancedRecordAllowed("BRONZE")).toBe(false);
    expect(studioRecordView({ step: "record", fullView: true, advancedAllowed: false })).toBe("simple");
  });

  it("lets Silver and Gold open the advanced studio and switch back", () => {
    expect(studioAdvancedRecordAllowed("SILVER")).toBe(true);
    expect(studioAdvancedRecordAllowed("GOLD")).toBe(true);
    expect(studioRecordView({ step: "record", fullView: true, advancedAllowed: true })).toBe("full");
    expect(studioRecordView({ step: "record", fullView: false, advancedAllowed: true })).toBe("simple");
  });
});

describe("record simple surface wiring", () => {
  const root = process.cwd();
  const editor = readFileSync(join(root, "src/components/studio/studio-editor.tsx"), "utf8");
  const panel = readFileSync(join(root, "src/components/studio/studio-recording-panel.tsx"), "utf8");

  it("gates the record step on studioRecordView and one recording panel", () => {
    expect(editor).toMatch(/studioRecordView\(\{ step: studioStep, fullView: recordFullView, advancedAllowed: advancedRecord \}\)/);
    expect(editor).toMatch(/studioAdvancedRecordAllowed\(trackCapacity\.premiumTier\)/);
    expect(editor).toMatch(/data-testid="studio-record-simple-only"/);
    expect(editor).toMatch(/data-testid="studio-record-simple"/);
    expect(editor).toMatch(/data-testid="studio-record-full-view"/);
    expect(editor).toMatch(/aria-pressed=\{recordFullView\}/);
    expect(editor).toMatch(
      /deriveStudioInspectorContext\(\{[\s\S]*?recordingActive: recordingContextActive \|\| recordSimple/,
    );
    expect(editor).toMatch(/simple=\{recordSimple\}/);
    expect(editor).toMatch(/studioStep !== "master" && !recordSimple/);
    expect(editor).toMatch(/\{!recordSimple \? \([\s\S]*?data-testid="studio-track-header-mix"/);
    expect(editor.match(/<StudioRecordingPanel/g)).toHaveLength(1);
  });

  it("hides comping, punch, latency and catalog in the simple recording panel", () => {
    expect(panel).toMatch(/simple = false/);
    expect(panel).toMatch(/data-record-density=\{simple \? "simple" : "full"\}/);
    expect(panel).toMatch(/\{!simple \? \(\s*<StudioLatencyCard/);
    expect(panel).toMatch(/\{!simple \? \(\s*<StudioRecModeCard/);
    expect(panel).toMatch(/\{!simple \? \(\s*<StudioLyricsCard/);
    expect(panel).toMatch(/\{!simple \? \(\s*<>\s*<StudioTakeLanesCard/);
    expect(panel).toMatch(/\{!simple \? \(\s*<div[\s\S]*?StudioMarkersPanel/);
    expect(panel).toMatch(/\{!simple \? \(\s*<div[\s\S]*?outputDevices\.pickerEnabled/);
    expect(panel).toMatch(/void prepareMicrophone\(\)/);
    expect(panel).toMatch(/importFileInputRef/);
  });
});

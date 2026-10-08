/**
 * Phase 7.1.4 — Mixer Dock / Chrome contracts
 * (OD-P7.1.4-01=A, -02=A, -03=A, -04=A).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(root, "src/components/studio/studio-mixer-shell.tsx"),
  "utf8",
);
const inspectorShell = readFileSync(
  join(root, "src/components/studio/studio-inspector-shell.tsx"),
  "utf8",
);
const p713 = readFileSync(
  join(root, "src/lib/studio/p7-1-3-inspector-ia.test.ts"),
  "utf8",
);

describe("Phase 7.1.4 mixer state / XOR", () => {
  it("keeps open/close helpers and does not bypass XOR on open", () => {
    expect(editor).toMatch(/function openMixerSurface/);
    expect(editor).toMatch(/function closeMixerSurface/);
    expect(editor).toMatch(/function toggleMixerSurface/);
    expect(editor).toMatch(/function openInspectorOverlay/);
    expect(editor).toMatch(/setInspectorOverlayOpen\(false\)/);
    expect(editor).toMatch(/setMixerOpen\(false\)/);
    // Toolbar uses toggle helper — open path goes through openMixerSurface only.
    expect(editor).toMatch(/onClick=\{toggleMixerSurface\}/);
    expect(editor.match(/setMixerOpen\(true\)/g)?.length ?? 0).toBe(1);
  });

  it("Inspector open closes Mixer; Mixer open closes Inspector overlay", () => {
    const openInspector = editor.slice(
      editor.indexOf("function openInspectorOverlay"),
      editor.indexOf("function closeInspectorOverlay"),
    );
    expect(openInspector).toMatch(/setMixerOpen\(false\)/);
    expect(openInspector).toMatch(/setInspectorOverlayOpen\(true\)/);

    const openMixer = editor.slice(
      editor.indexOf("function openMixerSurface"),
      editor.indexOf("function closeMixerSurface"),
    );
    expect(openMixer).toMatch(/setInspectorOverlayOpen\(false\)/);
    expect(openMixer).toMatch(/setMixerOpen\(true\)/);
  });

  it("desktop coexistence: dock uses xl rail; overlay gated off desktop", () => {
    expect(editor).toMatch(/StudioMixerDockChrome/);
    expect(editor).toMatch(/inspectorDesktopRail && mixerOpen/);
    expect(editor).toMatch(/mixerOpen && !inspectorDesktopRail/);
    expect(shell).toMatch(/hidden[\s\S]*xl:flex/);
    expect(shell).toMatch(/xl:hidden/);
  });
});

describe("Phase 7.1.4 desktop dock + collapse", () => {
  it("exposes collapsible chrome with aria-expanded / aria-controls", () => {
    expect(shell).toMatch(/data-testid="studio-mixer-dock"/);
    expect(shell).toMatch(/data-testid="studio-mixer-chrome"/);
    expect(shell).toMatch(/data-testid="studio-mixer-collapse"/);
    expect(shell).toMatch(/aria-expanded=\{expanded\}/);
    expect(shell).toMatch(/aria-controls=\{panelId\}/);
    expect(shell).toMatch(/max-h-\[17\.5rem\]/);
    expect(editor).toMatch(/aria-controls=\{mixerPanelId\}/);
  });

  it("collapsed state is UI-only — selection SSOT untouched", () => {
    expect(editor).toMatch(/selectedTrackId/);
    expect(editor).toMatch(/setTrackMeterTarget\(activeSelectedTrackId\)/);
    expect(editor).not.toMatch(
      /closeMixerSurface[\s\S]{0,120}setSelectedTrackId\(null\)/,
    );
  });
});

describe("Phase 7.1.4 channels + Master sticky-first", () => {
  it("reuses Gain/Pan/Meter/FX; no Mixer primary M/S/R handlers", () => {
    const channelsStart = editor.indexOf("const mixerChannels");
    expect(channelsStart).toBeGreaterThan(0);
    const channels = editor.slice(
      channelsStart,
      editor.indexOf('data-testid="studio-daw-shell"', channelsStart),
    );
    expect(channels).toMatch(/StudioMixControl/);
    expect(channels).toMatch(/StudioMasterMeter/);
    expect(channels).toMatch(/StudioTrackMeter/);
    expect(channels).toMatch(/Efekty Master/);
    expect(channels).toMatch(/Efekty ścieżki/);
    expect(channels).not.toMatch(/StudioToggleChip/);
    expect(channels).not.toMatch(/recordArmed/);
    expect(channels).not.toMatch(/title="Wycisz"/);
    expect(channels).not.toMatch(/title="Solo"/);
  });

  it("Master sticky-first and distinct from tracks", () => {
    expect(editor).toMatch(/data-testid="studio-mix-master"/);
    expect(editor).toMatch(/sticky left-0/);
    expect(editor).toMatch(/>Master</);
    expect(editor).toMatch(/patchMasterMix/);
    expect(editor).not.toMatch(/studio_track.*master|master.*studio_track/i);
  });

  it("channel strip keeps horizontal overflow scroll", () => {
    expect(editor).toMatch(
      /overflow-x-auto[\s\S]*?data-testid="studio-mixer-drawer"/,
    );
  });
});

describe("Phase 7.1.4 tablet/mobile overlay a11y", () => {
  it("bottom sheet dialog with Escape, focus trap, backdrop, safe-area, 44px", () => {
    expect(shell).toMatch(/data-testid="studio-mixer-overlay"/);
    expect(shell).toMatch(/data-testid="studio-mixer-sheet"/);
    expect(shell).toMatch(/data-testid="studio-mixer-backdrop"/);
    expect(shell).toMatch(/role="dialog"/);
    expect(shell).toMatch(/aria-modal="true"/);
    expect(shell).toMatch(/Escape/);
    expect(shell).toMatch(/safe-area-inset-bottom/);
    expect(shell).toMatch(/min-h-11 min-w-11/);
    expect(shell).toMatch(/previouslyFocusedRef/);
  });

  it("overlay z-40 does not exceed StudioFxSheet z-50 band", () => {
    expect(shell).toMatch(/className="fixed inset-0 z-40 flex xl:hidden"/);
    expect(shell).not.toMatch(/className="[^"]*z-50/);
    const fx = readFileSync(
      join(root, "src/components/studio/studio-fx-chain-editor.tsx"),
      "utf8",
    );
    expect(fx).toMatch(/z-50/);
  });
});

describe("Phase 7.1.4 architecture guards", () => {
  it("does not invent a second engine, AudioContext, or selection store", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(shell).not.toMatch(/new StudioAudioEngine/);
    expect(shell).not.toMatch(/new AudioContext/);
    expect(shell).not.toMatch(/createContext/);
    expect(editor).toMatch(/patchTrack/);
    expect(editor).toMatch(/patchMasterMix/);
  });

  it("shell blocks page-level horizontal overflow", () => {
    expect(editor).toMatch(
      /data-testid="studio-daw-shell"[\s\S]*?overflow-x-hidden/,
    );
  });

  it("preserves Phase 7.1.3 Inspector XOR contracts", () => {
    expect(p713).toMatch(/openMixerSurface/);
    expect(inspectorShell).toMatch(/studio-inspector-overlay/);
    expect(editor).toMatch(/StudioInspectorOverlay/);
  });
});

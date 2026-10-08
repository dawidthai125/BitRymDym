/**
 * P6.4.3 — Mix UX polish & integration (Track/Master layout, safe-area, boundaries).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  emptyStudioFxChain,
  studioFxEntryLabel,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";

const FIXED = "11111111-1111-4111-8111-111111111111";

function chainWith(
  effects: StudioFxChainV1["effects"],
): StudioFxChainV1 {
  return { schemaVersion: 1, effects };
}

describe("P6.4.3 FX entry labels", () => {
  it("shows FX when empty", () => {
    expect(studioFxEntryLabel(emptyStudioFxChain())).toBe("FX");
  });

  it("shows count without bypass hint when all enabled", () => {
    expect(
      studioFxEntryLabel(
        chainWith([
          {
            id: FIXED,
            type: "eq",
            enabled: true,
            params: {
              low: { frequencyHz: 120, gainDb: 0, q: 0.7 },
              mid: { frequencyHz: 1000, gainDb: 0, q: 1 },
              high: { frequencyHz: 8000, gainDb: 0, q: 0.7 },
            },
          },
        ]),
      ),
    ).toBe("FX (1)");
  });

  it("includes bypass count when effects disabled", () => {
    expect(
      studioFxEntryLabel(
        chainWith([
          {
            id: FIXED,
            type: "delay",
            enabled: false,
            params: { mix: 0, timeMs: 250, feedback: 0.25 },
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            type: "reverb",
            enabled: true,
            params: { mix: 0, decaySeconds: 1.2 },
          },
        ]),
      ),
    ).toBe("FX (2, 1 wył.)");
  });
});

describe("P6.4.3 Mix UX integration contracts", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const sheet = readFileSync(
    join(process.cwd(), "src/components/studio/studio-fx-chain-editor.tsx"),
    "utf8",
  );
  const mix = readFileSync(
    join(process.cwd(), "src/components/studio/studio-mix-control.tsx"),
    "utf8",
  );
  const chip = readFileSync(
    join(process.cwd(), "src/components/studio/studio-toggle-chip.tsx"),
    "utf8",
  );

  it("Track Mix: channel-strip order Meter → Level → Pan → M/S/R → FX (Visual Shell)", () => {
    expect(editor).toMatch(/studioFxEntryLabel/);
    expect(editor).toMatch(/aria-label=\"Mix\"/);
    // Headers + mixer both expose M/S/R; strip order is Visual Shell OD freeze.
    const muteIdx = editor.indexOf('title="Wycisz"');
    const soloIdx = editor.indexOf('title="Solo"');
    const mixerStart = editor.indexOf('data-testid="studio-mixer-drawer"');
    expect(mixerStart).toBeGreaterThan(0);
    const mixer = editor.slice(mixerStart);
    const gainIdx = mixer.indexOf("ariaLabel={`Głośność ścieżki");
    const panIdx = mixer.indexOf("ariaLabel={`Panorama ścieżki");
    const meterIdx = mixer.indexOf("<StudioTrackMeter");
    const fxIdx = mixer.indexOf("Efekty ścieżki");
    expect(muteIdx).toBeGreaterThan(0);
    expect(soloIdx).toBeGreaterThan(muteIdx);
    expect(gainIdx).toBeGreaterThanOrEqual(0);
    expect(meterIdx).toBeGreaterThanOrEqual(0);
    expect(gainIdx).toBeGreaterThan(meterIdx);
    expect(panIdx).toBeGreaterThan(gainIdx);
    expect(fxIdx).toBeGreaterThan(panIdx);
    expect(mixer).toMatch(/data-testid="studio-mix-track-msr"/);
  });

  it("Master Mix: distinguished card + Level → Pan → FX → Meter (V2)", () => {
    expect(editor).toMatch(/border-\[var\(--brd-green\)\]/);
    expect(editor).toMatch(/Głośność Master/);
    expect(editor).toMatch(/Panorama Master/);
    expect(editor).toMatch(/StudioMasterMeter/);
    expect(editor).toMatch(/Efekty Master/);
    expect(editor).toMatch(/studioFxEntryLabel\(doc\.project\.masterFxChain\)/);
    // Visual Parity V2 — Master strip: Level · Pan · FX · meter
    const mixerStart = editor.indexOf('data-testid="studio-mixer-drawer"');
    expect(mixerStart).toBeGreaterThan(0);
    const mixer = editor.slice(mixerStart);
    const gainIdx = mixer.indexOf('ariaLabel="Głośność Master"');
    const panIdx = mixer.indexOf('ariaLabel="Panorama Master"');
    const fxIdx = mixer.indexOf('aria-label="Efekty Master"');
    const meterIdx = mixer.indexOf("<StudioMasterMeter");
    expect(gainIdx).toBeGreaterThanOrEqual(0);
    expect(panIdx).toBeGreaterThan(gainIdx);
    expect(fxIdx).toBeGreaterThan(panIdx);
    expect(meterIdx).toBeGreaterThan(fxIdx);
  });

  it("reuses StudioMixControl for Track Gain/Pan (no duplicate raw track ranges)", () => {
    expect(editor).toMatch(/StudioMixControl/);
    // Track gain/pan go through shared control — no bare track range inputs for gain/pan
    expect(editor).not.toMatch(
      /aria-label=\"Głośność ścieżki\"[\s\S]{0,80}type=\"range\"/,
    );
  });

  it("Mute/Solo use StudioToggleChip with aria-pressed", () => {
    expect(chip).toMatch(/aria-pressed=\{active\}/);
    expect(editor).toMatch(/StudioToggleChip/);
    expect(editor).toMatch(/title=\"Wycisz\"/);
    expect(editor).toMatch(/title=\"Solo\"/);
  });

  it("FX sheet/drawer sits above bottom-nav (z-50) with safe-area", () => {
    expect(sheet).toMatch(/z-50/);
    expect(sheet).toMatch(/safe-area-inset-bottom/);
    expect(sheet).toMatch(/StudioFxSheet/);
    expect(editor).toMatch(/StudioFxSheet/);
  });

  it("editor scroll-padding clears bottom-nav intercept zone", () => {
    // Phase 1 — DAW shell + project page own safe-area / bottom-nav clearance.
    expect(editor).toMatch(/studio-daw-shell/);
    const page = readFileSync(
      join(process.cwd(), "src/app/studio/p/[projectId]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/safe-area-inset-bottom/);
  });

  it("transport sticky + 44px targets + accessible labels", () => {
    expect(editor).toMatch(/sticky top-14/);
    expect(editor).toMatch(/aria-label=\"Transport Studio\"/);
    // Visual Parity V2 — Play label may include noBeat “wymaga bitu” suffix.
    expect(editor).toMatch(/aria-label=\{noBeat \? \"Odtwórz — wymaga bitu\" : \"Odtwórz\"\}/);
    expect(editor).toMatch(/aria-label=\"Stop\"/);
    expect(editor).toMatch(/min-h-11/);
  });

  it("CAS conflict UX offers Odśwież recovery", () => {
    expect(editor).toMatch(/Odśwież/);
    expect(editor).toMatch(/FX_CHAIN_CONFLICT_UI_PL/);
    expect(sheet).toMatch(/conflict/);
    expect(sheet).toMatch(/Odśwież/);
  });

  it("StudioMixControl commits on pointerUp only", () => {
    expect(mix).toMatch(/onPointerUp/);
    expect(mix).toMatch(/onCommit/);
    expect(mix).toMatch(/h-11/);
    expect(mix).not.toMatch(/onPointerMove/);
  });

  it("keeps StudioAudioEngine boundary; no PlayerProvider / mix-graph / StudioMixEngine", () => {
    expect(editor).not.toMatch(/PlayerProvider/);
    expect(editor).not.toMatch(/mix-graph/);
    expect(editor).not.toMatch(/StudioMixEngine/);
    expect(sheet).not.toMatch(/PlayerProvider/);
    expect(sheet).not.toMatch(/mix-graph/);
    expect(sheet).not.toMatch(/StudioMixEngine/);
    expect(sheet).not.toMatch(/new AudioContext/);
    const engine = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engine).toMatch(/class StudioAudioEngine|export class StudioAudioEngine|StudioAudioEngine/);
  });

  it("shared editor still wired for track and master roles", () => {
    expect(editor).toMatch(/role=\"master\"/);
    expect(editor).toMatch(/role=\"track\"/);
    expect(editor).toMatch(/StudioFxChainEditor/);
  });
});

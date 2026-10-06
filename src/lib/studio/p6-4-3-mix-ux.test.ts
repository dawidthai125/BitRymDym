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

  it("Track Mix: Mute/Solo then Gain/Pan then FX entry", () => {
    expect(editor).toMatch(/studioFxEntryLabel/);
    expect(editor).toMatch(/aria-label=\"Mix\"/);
    const muteIdx = editor.indexOf('label="Wycisz"');
    const soloIdx = editor.indexOf('label="Odsłuch"');
    const gainIdx = editor.indexOf('ariaLabel={`Głośność ścieżki');
    const fxIdx = editor.indexOf("Efekty ścieżki");
    expect(muteIdx).toBeGreaterThan(0);
    expect(soloIdx).toBeGreaterThan(muteIdx);
    expect(gainIdx).toBeGreaterThan(soloIdx);
    expect(fxIdx).toBeGreaterThan(gainIdx);
  });

  it("Master Mix: distinguished card + Gain/Pan + FX entry", () => {
    expect(editor).toMatch(/border-\[var\(--brd-green\)\]/);
    expect(editor).toMatch(/Głośność Master/);
    expect(editor).toMatch(/Panorama Master/);
    expect(editor).toMatch(/Efekty Master/);
    expect(editor).toMatch(/studioFxEntryLabel\(doc\.project\.masterFxChain\)/);
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
    expect(editor).toMatch(/scroll-pb-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
    expect(editor).toMatch(/safe-area-inset-bottom/);
  });

  it("transport sticky + 44px targets + accessible labels", () => {
    expect(editor).toMatch(/sticky top-14/);
    expect(editor).toMatch(/aria-label=\"Transport Studio\"/);
    expect(editor).toMatch(/aria-label=\"Odtwórz\"/);
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

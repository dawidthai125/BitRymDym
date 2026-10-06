/**
 * P6.4.2 — Shared FX UI foundation (registry-driven StudioFxChainEditor).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  addStudioFxToChain,
  applyStudioFxCasToState,
  canMoveStudioFx,
  createStudioFxInstance,
  emptyStudioFxChain,
  getStudioFxParamValue,
  moveStudioFx,
  removeStudioFxFromChain,
  setStudioFxEnabled,
  setStudioFxParamValue,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  STUDIO_FX_DEFAULTS,
  STUDIO_FX_TYPES,
  STUDIO_FX_UI_META,
  studioFxLabelPl,
} from "@/lib/studio/studio-fx-chain";

const FIXED_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

describe("P6.4.2 FX UI metadata SSOT", () => {
  it("exposes UI meta for every registry FX type", () => {
    for (const type of STUDIO_FX_TYPES) {
      expect(STUDIO_FX_UI_META[type].labelPl).toBeTruthy();
      expect(STUDIO_FX_UI_META[type].params.length).toBeGreaterThan(0);
      expect(studioFxLabelPl(type)).toBe(STUDIO_FX_UI_META[type].labelPl);
    }
  });

  it("UI param ranges stay within parser bounds (spot-check)", () => {
    const eq = STUDIO_FX_UI_META.eq.params;
    const lowF = eq.find((p) => p.path === "low.frequencyHz")!;
    expect(lowF.min).toBe(20);
    expect(lowF.max).toBe(500);
    const thr = STUDIO_FX_UI_META.compressor.params.find(
      (p) => p.path === "thresholdDb",
    )!;
    expect(thr.min).toBe(-60);
    expect(thr.max).toBe(0);
  });

  it("default params match registry defaults via createStudioFxInstance", () => {
    for (const type of STUDIO_FX_TYPES) {
      const effect = createStudioFxInstance(type, () => FIXED_IDS[0]!);
      expect(effect.params).toEqual(STUDIO_FX_DEFAULTS[type]);
      expect(effect.enabled).toBe(true);
    }
  });
});

describe("P6.4.2 shared chain mutations", () => {
  it("adds FX to Track and Master with defaults", () => {
    let track = emptyStudioFxChain();
    track = addStudioFxToChain(track, "eq", "track", () => FIXED_IDS[0]!);
    expect(track.effects).toHaveLength(1);
    expect(track.effects[0]?.type).toBe("eq");

    let master = emptyStudioFxChain();
    master = addStudioFxToChain(master, "compressor", "master", () => FIXED_IDS[1]!);
    expect(master.effects[0]?.type).toBe("compressor");
  });

  it("removes FX without mutating siblings", () => {
    let chain = emptyStudioFxChain();
    let i = 0;
    chain = addStudioFxToChain(chain, "eq", "track", () => FIXED_IDS[i++]!);
    chain = addStudioFxToChain(chain, "delay", "track", () => FIXED_IDS[i++]!);
    const kept = chain.effects[1]!;
    chain = removeStudioFxFromChain(chain, chain.effects[0]!.id);
    expect(chain.effects).toEqual([kept]);
  });

  it("toggles enabled without removing slot", () => {
    let chain = addStudioFxToChain(
      emptyStudioFxChain(),
      "reverb",
      "track",
      () => FIXED_IDS[0]!,
    );
    const id = chain.effects[0]!.id;
    chain = setStudioFxEnabled(chain, id, false, "track");
    expect(chain.effects[0]?.enabled).toBe(false);
    expect(chain.effects).toHaveLength(1);
    chain = setStudioFxEnabled(chain, id, true, "track");
    expect(chain.effects[0]?.enabled).toBe(true);
  });

  it("reorder ↑/↓ and first/last disabled semantics", () => {
    let chain = emptyStudioFxChain();
    let i = 0;
    chain = addStudioFxToChain(chain, "eq", "track", () => FIXED_IDS[i++]!);
    chain = addStudioFxToChain(chain, "delay", "track", () => FIXED_IDS[i++]!);
    expect(canMoveStudioFx(chain, 0, "up", "track")).toBe(false);
    expect(canMoveStudioFx(chain, 1, "down", "track")).toBe(false);
    expect(canMoveStudioFx(chain, 0, "down", "track")).toBe(true);
    chain = moveStudioFx(chain, 0, "down", "track");
    expect(chain.effects.map((e) => e.type)).toEqual(["delay", "eq"]);
    chain = moveStudioFx(chain, 1, "up", "track");
    expect(chain.effects.map((e) => e.type)).toEqual(["eq", "delay"]);
  });

  it("Master limiter-last guard blocks illegal reorder", () => {
    let chain = emptyStudioFxChain();
    let i = 0;
    chain = addStudioFxToChain(chain, "eq", "master", () => FIXED_IDS[i++]!);
    chain = addStudioFxToChain(chain, "limiter", "master", () => FIXED_IDS[i++]!);
    expect(canMoveStudioFx(chain, 1, "up", "master")).toBe(false);
    expect(canMoveStudioFx(chain, 0, "down", "master")).toBe(false);
  });

  it("parameter path get/set round-trips", () => {
    const effect = createStudioFxInstance("delay", () => FIXED_IDS[0]!);
    const next = setStudioFxParamValue(effect.params, "mix", 0.42);
    expect(getStudioFxParamValue(next, "mix")).toBe(0.42);
    expect(getStudioFxParamValue(next, "timeMs")).toBe(
      STUDIO_FX_DEFAULTS.delay.timeMs,
    );
  });

  it("refuses add beyond max 8", () => {
    let chain = emptyStudioFxChain();
    for (let n = 0; n < STUDIO_FX_CHAIN_MAX_EFFECTS; n++) {
      chain = addStudioFxToChain(
        chain,
        "eq",
        "track",
        () =>
          `${n.toString().padStart(8, "0")}-1111-4111-8111-111111111111`,
      );
    }
    expect(() =>
      addStudioFxToChain(chain, "delay", "track", () => FIXED_IDS[0]!),
    ).toThrow(/8/);
  });

  it("CAS version propagation model for chain commit", () => {
    let state = {
      documentVersion: 5,
      chain: emptyStudioFxChain(),
    };
    const nextChain = addStudioFxToChain(
      state.chain,
      "eq",
      "track",
      () => FIXED_IDS[0]!,
    );
    state = applyStudioFxCasToState(state, 5, (s) => {
      s.chain = nextChain;
    });
    expect(state.documentVersion).toBe(6);
    expect(state.chain.effects).toHaveLength(1);
    expect(() =>
      applyStudioFxCasToState(state, 5, (s) => {
        s.chain = emptyStudioFxChain();
      }),
    ).toThrow(/zmieniony/);
    expect(state.documentVersion).toBe(6);
  });
});

describe("P6.4.2 component / isolation contracts", () => {
  it("StudioFxChainEditor is shared for track and master roles", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/components/studio/studio-fx-chain-editor.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/role:\s*StudioFxChainRole/);
    expect(src).toMatch(/STUDIO_FX_UI_META/);
    expect(src).toMatch(/StudioToggleChip/);
    expect(src).toMatch(/Włączony/);
    expect(src).toMatch(/Wyłączony/);
    expect(src).toMatch(/min-h-11/);
    expect(src).toMatch(/pointerUp|onPointerUp|onCommit/);
    const chip = readFileSync(
      join(process.cwd(), "src/components/studio/studio-toggle-chip.tsx"),
      "utf8",
    );
    expect(chip).toMatch(/aria-pressed/);
    expect(src).not.toMatch(/mix-graph/);
    expect(src).not.toMatch(/PlayerProvider/);
    expect(src).not.toMatch(/StudioMixEngine/);
    expect(src).not.toMatch(/AudioContext/);
  });

  it("studio-editor wires shared editor for Track and Master", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(src).toMatch(/StudioFxChainEditor/);
    expect(src).toMatch(/role=\"master\"/);
    expect(src).toMatch(/role=\"track\"/);
    expect(src).toMatch(/StudioMixControl/);
    expect(src).toMatch(/StudioFxSheet/);
    expect(src).not.toMatch(/mix-graph/);
    expect(src).not.toMatch(/PlayerProvider/);
  });

  it("does not invent a second FX catalog module", () => {
    const files = [
      "src/components/studio/studio-fx-chain-editor.tsx",
      "src/components/studio/studio-editor.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/FX_UI_REGISTRY/);
      expect(src).not.toMatch(/effectCatalog/);
      expect(src).not.toMatch(/studioFxCatalog/);
    }
    const chain = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-fx-chain.ts"),
      "utf8",
    );
    expect(chain).toMatch(/STUDIO_FX_UI_META/);
  });
});

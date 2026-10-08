/**
 * Phase 7.1.5 — transport isolation · FxSheet a11y · keyboard · toolbar overflow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createStudioTransportIsolationBus } from "@/components/studio/studio-transport-provider";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const provider = readFileSync(
  join(root, "src/components/studio/studio-transport-provider.tsx"),
  "utf8",
);
const fx = readFileSync(
  join(root, "src/components/studio/studio-fx-chain-editor.tsx"),
  "utf8",
);
const inspectorShell = readFileSync(
  join(root, "src/components/studio/studio-inspector-shell.tsx"),
  "utf8",
);

describe("Phase 7.1.5.1 — transport / meter render isolation", () => {
  it("splits controls / playhead / meters contexts", () => {
    expect(provider).toMatch(/StudioTransportControlsContext/);
    expect(provider).toMatch(/StudioTransportPlayheadContext/);
    expect(provider).toMatch(/StudioTransportMetersContext/);
    expect(provider).toMatch(/useStudioTransportControls/);
    expect(provider).toMatch(/useStudioTransportPlayhead/);
    expect(provider).toMatch(/useStudioTransportMeters/);
    expect(provider).toMatch(/createStudioTransportIsolationBus/);
  });

  it("keeps a single StudioAudioEngine in the provider", () => {
    expect(provider.match(/new StudioAudioEngine/g)?.length).toBe(1);
    expect(provider).not.toMatch(/new AudioContext/);
  });

  it("StudioEditorInner uses controls hook — not wide useStudioTransport", () => {
    expect(editor).toMatch(/useStudioTransportControls\(\)/);
    expect(editor).toMatch(/StudioMasterMeterLive/);
    expect(editor).toMatch(/StudioTrackMeterLive/);
    expect(editor).toMatch(/StudioTimelinePlayheadBound/);
    expect(editor).toMatch(/useStudioTransportMeters/);
    expect(editor).toMatch(/useStudioTransportPlayhead/);
    // Wide hook must not be the Inner subscription.
    const innerStart = editor.indexOf("function StudioEditorInner");
    const transportBarStart = editor.indexOf("function StudioTransportBar");
    const inner = editor.slice(innerStart, transportBarStart);
    expect(inner).toMatch(/useStudioTransportControls/);
    expect(inner).not.toMatch(/useStudioTransport\(\)/);
  });

  it("isolation bus: meter tick does not increment controls renders", () => {
    const bus = createStudioTransportIsolationBus();
    bus.subscribe("controls", () => {});
    bus.subscribe("playhead", () => {});
    bus.subscribe("meters", () => {});

    bus.notify("meters");
    bus.notify("meters");
    expect(bus.getRenderCounts()).toEqual({
      controls: 0,
      playhead: 0,
      meters: 2,
    });

    bus.notify("playhead");
    expect(bus.getRenderCounts()).toEqual({
      controls: 0,
      playhead: 1,
      meters: 2,
    });

    bus.notify("controls");
    expect(bus.getRenderCounts()).toEqual({
      controls: 1,
      playhead: 1,
      meters: 2,
    });
  });

  it("controlsApi useMemo excludes playheadMs / meter from dependency list", () => {
    const memoStart = provider.indexOf("const controlsApi = useMemo");
    expect(memoStart).toBeGreaterThan(0);
    const end = provider.indexOf("const clampedPlayhead", memoStart);
    expect(end).toBeGreaterThan(memoStart);
    const memoBlock = provider.slice(memoStart, end);
    expect(memoBlock).not.toMatch(/\bplayheadMs\b/);
    expect(memoBlock).not.toMatch(/\bmeter\b/);
    expect(memoBlock).not.toMatch(/\btrackMeter\b/);
  });
});

describe("Phase 7.1.5.2 — StudioFxSheet a11y parity", () => {
  it("declares dialog, aria-modal, Escape, trap, restore, backdrop, close ≥44px", () => {
    const sheetStart = fx.indexOf("export function StudioFxSheet");
    expect(sheetStart).toBeGreaterThan(0);
    const sheet = fx.slice(sheetStart);
    expect(sheet).toMatch(/role="dialog"/);
    expect(sheet).toMatch(/aria-modal="true"/);
    expect(sheet).toMatch(/Escape/);
    expect(sheet).toMatch(/getFocusable/);
    expect(sheet).toMatch(/previouslyFocusedRef/);
    expect(sheet).toMatch(/studio-fx-sheet-backdrop/);
    expect(sheet).toMatch(/min-h-11 min-w-11/);
    expect(sheet).toMatch(/studio-fx-sheet-close/);
  });
});

describe("Phase 7.1.5.3 — minimal transport keyboard", () => {
  it("binds Space play/pause and Home/End seek with typing exclusion", () => {
    expect(editor).toMatch(/event\.key === " " \|\| event\.code === "Space"/);
    expect(editor).toMatch(/transport\.phase === "playing"/);
    expect(editor).toMatch(/transport\.play\(\)/);
    expect(editor).toMatch(/transport\.pause\(\)/);
    expect(editor).toMatch(/event\.key === "Home"/);
    expect(editor).toMatch(/event\.key === "End"/);
    expect(editor).toMatch(/isTypingTarget/);
    expect(editor).toMatch(/INPUT[\s\S]*TEXTAREA[\s\S]*SELECT/);
  });
});

describe("Phase 7.1.5.4 — mobile toolbar overflow", () => {
  it("exposes Więcej overflow while keeping primary controls and ≥44px", () => {
    const toolbarStart = editor.indexOf('data-testid="studio-edit-toolbar"');
    const toolbarEnd = editor.indexOf(
      'className="flex min-h-0 flex-col gap-3 xl:flex-row',
      toolbarStart,
    );
    const toolbar = editor.slice(toolbarStart, toolbarEnd);
    expect(toolbar).toMatch(/studio-toolbar-more/);
    expect(toolbar).toMatch(/Więcej/);
    expect(toolbar).toMatch(/studio-toolbar-overflow/);
    for (const label of [
      "Zaznacz",
      "Edycja",
      "Podziel",
      "Usuń",
      "Mixer",
      "Inspector",
      "Snap",
      "zoom−",
      "zoom+",
      "Fit",
    ]) {
      expect(toolbar).toContain(label);
    }
    expect(toolbar).toMatch(/studio-add-track/);
    const buttons = toolbar.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    expect(toolbar.match(/className="min-h-11/g)?.length ?? 0).toBe(
      buttons.length,
    );
  });
});

describe("Phase 7.1.5.5 — optional micro-polish", () => {
  it("wires Inspector aria-controls to overlay panel id", () => {
    expect(editor).toMatch(/aria-controls=\{inspectorPanelId\}/);
    expect(inspectorShell).toMatch(/panelId\?:/);
    expect(inspectorShell).toMatch(/id=\{panelId\}/);
  });
});

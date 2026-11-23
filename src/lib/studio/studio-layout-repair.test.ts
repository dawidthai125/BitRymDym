import { describe, expect, it, vi } from "vitest";

import { stretchFromTempo } from "@/components/studio/studio-fragment-tools";
import { applyClipGeometryCommit } from "@/lib/studio/studio-clip-edit-preview";
import { handleStudioDialogKeydown, lockStudioPageScroll } from "@/lib/studio/studio-dialog-focus";
import { placeStudioPopover } from "@/lib/studio/studio-popover";
import {
  isStudioTypingTarget,
  studioControlKeepsKey,
  studioModalState,
} from "@/lib/studio/studio-shortcut-guard";
import { followPlayheadScrollLeft, studioSongEndMs } from "@/lib/studio/studio-timeline-view";

function el(tag: string, attrs: Record<string, string> = {}) {
  const self = {
    tagName: tag.toUpperCase(),
    getAttribute: (n: string) => attrs[n] ?? null,
    closest(selector: string): unknown {
      const parts = selector.split(",").map((p) => p.trim());
      const hit = parts.some((p) =>
        p.startsWith("[role=")
          ? attrs.role === p.slice(7, -2)
          : p === tag || (p === "a[href]" && tag === "a" && "href" in attrs),
      );
      return hit ? self : null;
    },
  };
  return self;
}

describe("studioSongEndMs", () => {
  it("is the end of the last clip or note, not the 6:00 canvas", () => {
    expect(studioSongEndMs(360_000, [{ timelineStartMs: 0, durationMs: 150_000 }])).toBe(150_000);
    expect(
      studioSongEndMs(360_000, [{ timelineStartMs: 0, durationMs: 40_000 }], [
        { midi: { notes: [{ t: 60_000, dur: 500 }] } },
        { midi: null },
      ]),
    ).toBe(60_500);
  });
  it("is at least 30 s and at most the canvas", () => {
    expect(studioSongEndMs(360_000, [])).toBe(30_000);
    expect(studioSongEndMs(20_000, [])).toBe(20_000);
    expect(studioSongEndMs(360_000, [{ timelineStartMs: 350_000, durationMs: 20_000 }])).toBe(360_000);
  });
});

describe("followPlayheadScrollLeft", () => {
  it("leaves a visible playhead alone and pages when it leaves the view", () => {
    expect(followPlayheadScrollLeft({ playheadPx: 500, scrollLeft: 0, viewportPx: 1000 })).toBeNull();
    expect(followPlayheadScrollLeft({ playheadPx: 990, scrollLeft: 0, viewportPx: 1000 })).toBe(890);
    expect(followPlayheadScrollLeft({ playheadPx: 10, scrollLeft: 2000, viewportPx: 1000 })).toBe(0);
    expect(followPlayheadScrollLeft({ playheadPx: 10, scrollLeft: 0, viewportPx: 0 })).toBeNull();
  });
});

describe("placeStudioPopover", () => {
  const panel = { width: 240, height: 400 };
  it("opens below the button, above it when there is no room", () => {
    expect(
      placeStudioPopover({ anchor: { left: 300, right: 340, top: 100, bottom: 140 }, panel, viewport: { width: 1440, height: 900 } }),
    ).toEqual({ left: 100, top: 144 });
    expect(
      placeStudioPopover({ anchor: { left: 300, right: 340, top: 700, bottom: 740 }, panel, viewport: { width: 1440, height: 900 } }),
    ).toEqual({ left: 100, top: 296 });
  });
  it.each([360, 390, 768, 1280, 1440, 1920])("stays on screen at %i px", (width) => {
    for (const top of [0, 300, 800]) {
      const p = placeStudioPopover({ anchor: { left: 2, right: 40, top, bottom: top + 44 }, panel, viewport: { width, height: 844 } });
      expect(p.left).toBeGreaterThanOrEqual(8);
      expect(p.left + panel.width).toBeLessThanOrEqual(width - 8);
      expect(p.top).toBeGreaterThanOrEqual(8);
      expect(p.top + panel.height).toBeLessThanOrEqual(844 - 8);
    }
  });
});

describe("keyboard shortcut guard", () => {
  it("text fields block everything, sliders do not", () => {
    expect(isStudioTypingTarget(el("input", { type: "text" }))).toBe(true);
    expect(isStudioTypingTarget(el("input"))).toBe(true);
    expect(isStudioTypingTarget(el("textarea"))).toBe(true);
    expect(isStudioTypingTarget(el("select"))).toBe(true);
    expect(isStudioTypingTarget(el("input", { type: "range" }))).toBe(false);
    expect(isStudioTypingTarget(el("button"))).toBe(false);
    expect(isStudioTypingTarget(null)).toBe(false);
  });
  it("a control focused from the keyboard keeps Space and arrows, never Delete or letters", () => {
    const button = el("button");
    expect(studioControlKeepsKey({ target: button, key: " ", focusedByPointer: false })).toBe(true);
    expect(studioControlKeepsKey({ target: button, key: "Delete", focusedByPointer: false })).toBe(false);
    expect(studioControlKeepsKey({ target: button, key: "p", focusedByPointer: false })).toBe(false);
    expect(studioControlKeepsKey({ target: el("div"), key: " ", focusedByPointer: false })).toBe(false);
  });
  it("after a mouse click Space is the transport again; a slider still keeps its arrows", () => {
    const slider = el("input", { type: "range" });
    expect(studioControlKeepsKey({ target: el("button"), key: " ", focusedByPointer: true })).toBe(false);
    expect(studioControlKeepsKey({ target: slider, key: "ArrowLeft", focusedByPointer: true })).toBe(true);
    expect(studioControlKeepsKey({ target: slider, key: " ", focusedByPointer: true })).toBe(false);
  });
  it("any modal blocks shortcuts, the record sheet alone does not block transport", () => {
    const doc = (ids: (string | null)[]) => ({ querySelectorAll: () => ids.map((id) => ({ getAttribute: () => id })) });
    expect(studioModalState(doc([]))).toBe("none");
    expect(studioModalState(doc(["studio-inspector-mobile"]))).toBe("record-sheet");
    expect(studioModalState(doc(["studio-beat-picker"]))).toBe("modal");
    expect(studioModalState(doc(["studio-inspector-mobile", "studio-fx-sheet-panel"]))).toBe("modal");
  });
});

describe("page scroll lock", () => {
  it("stays until the last dialog closes and puts back what was there", () => {
    const body = { style: { overflow: "auto", paddingRight: "" } };
    const view = { innerWidth: 1440, clientWidth: 1425 };
    const first = lockStudioPageScroll(body, view);
    const second = lockStudioPageScroll(body, view);
    expect(body.style).toEqual({ overflow: "hidden", paddingRight: "15px" });
    first();
    first();
    expect(body.style.overflow).toBe("hidden");
    second();
    expect(body.style).toEqual({ overflow: "auto", paddingRight: "" });
  });
});

describe("dialog Tab trap", () => {
  it("brings focus back when it got out of the dialog", () => {
    const first = { focus: vi.fn() };
    const last = { focus: vi.fn() };
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", preventDefault },
      panel: { contains: () => false } as unknown as HTMLElement,
      onClose: vi.fn(),
      getFocusable: () => [first, last] as unknown as HTMLElement[],
      activeElement: {} as Element,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
  });
});

describe("applyClipGeometryCommit", () => {
  const clip = { timelineStartMs: 1000, durationMs: 4000, sourceOffsetMs: 200 };
  it("shows the same geometry the server will answer with", () => {
    expect(applyClipGeometryCommit(clip, { kind: "move", timelineStartMs: 2500 })).toEqual({ ...clip, timelineStartMs: 2500 });
    expect(applyClipGeometryCommit(clip, { kind: "trim_left", trimMs: 500 })).toEqual({ timelineStartMs: 1500, durationMs: 3500, sourceOffsetMs: 700 });
    expect(applyClipGeometryCommit(clip, { kind: "trim_left", trimMs: 500 }, 0.5).sourceOffsetMs).toBe(450);
    expect(applyClipGeometryCommit(clip, { kind: "trim_right", trimMs: 500 }).durationMs).toBe(3500);
  });
});

describe("clip tempo slider", () => {
  it("right = faster: tempo 2 is stretch 0.5", () => {
    expect(stretchFromTempo(2)).toBe(0.5);
    expect(stretchFromTempo(0.5)).toBe(2);
    expect(stretchFromTempo(1)).toBe(1);
    expect(stretchFromTempo(1.25)).toBe(0.8);
  });
  it("every slider step comes back as the same tempo", () => {
    for (let i = 0; i <= 30; i += 1) {
      const tempo = Math.round((0.5 + i * 0.05) * 100) / 100;
      expect(Math.round((1 / stretchFromTempo(tempo)) * 100) / 100).toBe(tempo);
    }
  });
});

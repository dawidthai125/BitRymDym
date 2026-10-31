import { describe, expect, it } from "vitest";

import { BITEK_DOCK_CHROME, BITEK_FRAME_MARGIN, clampBitekFrame, floatingStopRect } from "./bitek-dock-frame";

const view = { w: 1280, h: 800 };

describe("BITEK dock frame", () => {
  it("keeps a dragged box inside the viewport and clamps size", () => {
    const out = clampBitekFrame({ x: -40, y: 2000, w: 20, h: 9000 }, view);
    expect(out.x).toBeGreaterThanOrEqual(8);
    expect(out.y).toBeLessThanOrEqual(view.h - 8 - 48);
    expect(out.w).toBe(280);
    expect(out.h).toBeLessThanOrEqual(640);
    const wide = clampBitekFrame({ x: 100, y: 100, w: 900, h: 100 }, { w: 360, h: 640 });
    expect(wide.w).toBeLessThanOrEqual(360 - 16);
  });

  it("moves off the floating Stop while recording on a phone", () => {
    const phone = { w: 390, h: 844 };
    const stop = floatingStopRect(phone);
    expect(stop).not.toBeNull();
    const parked = clampBitekFrame({ x: 100, y: 760, w: 300, h: 400 }, phone, { recording: true });
    const box = { x: parked.x, y: parked.y, w: 280, h: 72 };
    const hit = stop !== null && box.x < stop.x + stop.w && box.x + box.w > stop.x && box.y < stop.y + stop.h && box.y + box.h > stop.y;
    expect(hit).toBe(false);
    expect(floatingStopRect(view)).toBeNull();
  });

  it("keeps a window dragged to the right edge fully inside a 1024px viewport", () => {
    const viewport = { w: 1024, h: 768 };
    const out = clampBitekFrame({ x: 630, y: 40, w: 480, h: 360 }, viewport);
    expect(out.x).toBeGreaterThanOrEqual(BITEK_FRAME_MARGIN);
    expect(out.x + out.w).toBeLessThanOrEqual(viewport.w - BITEK_FRAME_MARGIN);
    expect(out.y + out.h + BITEK_DOCK_CHROME).toBeLessThanOrEqual(viewport.h - BITEK_FRAME_MARGIN);
  });

  it("shrinks a frame wider or taller than the screen, including a resize and an orientation change", () => {
    const wide = clampBitekFrame({ x: 0, y: 0, w: 900, h: 400 }, { w: 400, h: 700 });
    expect(wide.w).toBeLessThanOrEqual(400 - BITEK_FRAME_MARGIN * 2);
    expect(wide.x + wide.w).toBeLessThanOrEqual(400 - BITEK_FRAME_MARGIN);
    const landscape = clampBitekFrame(wide, { w: 700, h: 400 });
    expect(landscape.y + landscape.h + BITEK_DOCK_CHROME).toBeLessThanOrEqual(400 - BITEK_FRAME_MARGIN);
    expect(landscape.x + landscape.w).toBeLessThanOrEqual(700 - BITEK_FRAME_MARGIN);
  });

  it("pulls an old saved position back inside after the viewport got smaller", () => {
    const saved = { x: 2000, y: -80, w: 800, h: 900 };
    const out = clampBitekFrame(saved, { w: 1024, h: 600 });
    expect(out.x).toBeGreaterThanOrEqual(BITEK_FRAME_MARGIN);
    expect(out.y).toBeGreaterThanOrEqual(BITEK_FRAME_MARGIN);
    expect(out.x + out.w).toBeLessThanOrEqual(1024 - BITEK_FRAME_MARGIN);
    expect(out.y + out.h + BITEK_DOCK_CHROME).toBeLessThanOrEqual(600 - BITEK_FRAME_MARGIN);
  });

  it("shrinks below the usual minimum when the viewport cannot hold chrome plus chat", () => {
    const out = clampBitekFrame({ x: 0, y: 0, w: 400, h: 400 }, { w: 240, h: 180 });
    expect(out.x).toBeGreaterThanOrEqual(BITEK_FRAME_MARGIN);
    expect(out.y).toBeGreaterThanOrEqual(BITEK_FRAME_MARGIN);
    expect(out.x + out.w).toBeLessThanOrEqual(240 - BITEK_FRAME_MARGIN);
    expect(out.y + out.h + BITEK_DOCK_CHROME).toBeLessThanOrEqual(180 - BITEK_FRAME_MARGIN);
  });
});

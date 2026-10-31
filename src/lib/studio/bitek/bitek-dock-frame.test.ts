import { describe, expect, it } from "vitest";

import { clampBitekFrame, floatingStopRect } from "./bitek-dock-frame";

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
});

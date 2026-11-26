import { describe, expect, it } from "vitest";

import { isFullscreenToggleKey } from "./studio-fullscreen";

describe("isFullscreenToggleKey", () => {
  it("F and f toggle full screen", () => {
    expect(isFullscreenToggleKey({ key: "f" }, false)).toBe(true);
    expect(isFullscreenToggleKey({ key: "F" }, false)).toBe(true);
  });

  it("not while typing, with modifiers, on key repeat or when the key was already used", () => {
    expect(isFullscreenToggleKey({ key: "f" }, true)).toBe(false);
    expect(isFullscreenToggleKey({ key: "f", ctrlKey: true }, false)).toBe(false);
    expect(isFullscreenToggleKey({ key: "f", metaKey: true }, false)).toBe(false);
    expect(isFullscreenToggleKey({ key: "f", altKey: true }, false)).toBe(false);
    expect(isFullscreenToggleKey({ key: "f", repeat: true }, false)).toBe(false);
    // The Studio keyboard instrument plays F as a note and prevents the default.
    expect(isFullscreenToggleKey({ key: "f", defaultPrevented: true }, false)).toBe(false);
  });

  it("other keys do nothing", () => {
    expect(isFullscreenToggleKey({ key: "g" }, false)).toBe(false);
    expect(isFullscreenToggleKey({ key: "Escape" }, false)).toBe(false);
  });
});

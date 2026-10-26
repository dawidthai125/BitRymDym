import { describe, expect, it } from "vitest";

import {
  attachModalFocusTrap,
  getFocusableElements,
} from "@/lib/a11y/modal-focus-trap";

describe("modal-focus-trap (shared a11y helper)", () => {
  it("exports getFocusableElements and attachModalFocusTrap", () => {
    expect(typeof getFocusableElements).toBe("function");
    expect(typeof attachModalFocusTrap).toBe("function");
  });
});

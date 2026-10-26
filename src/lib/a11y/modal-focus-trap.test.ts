import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  attachModalFocusTrap,
  getFocusableElements,
  setAppShellInert,
} from "@/lib/a11y/modal-focus-trap";

describe("modal-focus-trap (shared a11y helper)", () => {
  it("exports getFocusableElements, attachModalFocusTrap, setAppShellInert", () => {
    expect(typeof getFocusableElements).toBe("function");
    expect(typeof attachModalFocusTrap).toBe("function");
    expect(typeof setAppShellInert).toBe("function");
  });

  it("setAppShellInert targets [data-app-shell] and restores previous inert", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/a11y/modal-focus-trap.ts"),
      "utf8",
    );
    expect(src).toMatch(/export function setAppShellInert/);
    expect(src).toMatch(/\[data-app-shell\]/);
    expect(src).toMatch(/shell\.inert = inert/);
    expect(src).toMatch(/shell\.inert = previous/);
  });
});

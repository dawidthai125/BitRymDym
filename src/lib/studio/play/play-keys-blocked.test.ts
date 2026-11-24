import { describe, expect, it } from "vitest";

import { playKeysBlocked } from "./keyboard-map";

const el = (tagName: string, type = "") => ({ tagName, type, isContentEditable: false }) as unknown as EventTarget;

describe("playKeysBlocked", () => {
  it("text fields keep every key", () => {
    expect(playKeysBlocked(el("INPUT", "text"), "KeyA")).toBe(true);
    expect(playKeysBlocked(el("INPUT", "number"), "Digit1")).toBe(true);
    expect(playKeysBlocked(el("TEXTAREA"), "KeyA")).toBe(true);
  });
  it("the instrument still plays with the focus left on the list or a checkbox", () => {
    expect(playKeysBlocked(el("SELECT"), "KeyA")).toBe(false);
    expect(playKeysBlocked(el("INPUT", "checkbox"), "Digit1")).toBe(false);
    expect(playKeysBlocked(el("SELECT"), "Space")).toBe(true);
    expect(playKeysBlocked(el("SELECT"), "ArrowDown")).toBe(true);
    expect(playKeysBlocked(el("INPUT", "checkbox"), "Space")).toBe(true);
  });
  it("buttons and the page do not block", () => {
    expect(playKeysBlocked(el("BUTTON"), "Space")).toBe(false);
    expect(playKeysBlocked(null, "KeyA")).toBe(false);
  });
});

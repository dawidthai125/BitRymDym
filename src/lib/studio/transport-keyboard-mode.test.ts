import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE,
  parseStudioTransportKeyboardMode,
  resolveStudioTransportKeyAction,
} from "@/lib/studio/transport-keyboard-mode";

describe("transport-keyboard-mode", () => {
  it("defaults to quick_rec", () => {
    expect(DEFAULT_STUDIO_TRANSPORT_KEYBOARD_MODE).toBe("quick_rec");
    expect(parseStudioTransportKeyboardMode(null)).toBe("quick_rec");
    expect(parseStudioTransportKeyboardMode("standard_daw")).toBe("standard_daw");
  });

  it("quick_rec: Space/R record, P play", () => {
    expect(
      resolveStudioTransportKeyAction({ mode: "quick_rec", key: " ", code: "Space" }),
    ).toBe("record");
    expect(resolveStudioTransportKeyAction({ mode: "quick_rec", key: "r" })).toBe(
      "record",
    );
    expect(resolveStudioTransportKeyAction({ mode: "quick_rec", key: "p" })).toBe(
      "play",
    );
  });

  it("standard_daw: Space play, R record, P ignored", () => {
    expect(
      resolveStudioTransportKeyAction({
        mode: "standard_daw",
        key: " ",
        code: "Space",
      }),
    ).toBe("play");
    expect(
      resolveStudioTransportKeyAction({ mode: "standard_daw", key: "R" }),
    ).toBe("record");
    expect(
      resolveStudioTransportKeyAction({ mode: "standard_daw", key: "p" }),
    ).toBe(null);
  });

  it("ignores modifiers", () => {
    expect(
      resolveStudioTransportKeyAction({
        mode: "quick_rec",
        key: " ",
        ctrlKey: true,
      }),
    ).toBe(null);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  readStudioTransportKeyboardModeLive,
  setStudioTransportKeyboardModeLive,
  subscribeStudioTransportKeyboardMode,
} from "@/lib/studio/transport-keyboard-mode";

describe("transport keyboard mode live store", () => {
  it("defaults to quick_rec, notifies subscribers and keeps the session value", () => {
    expect(readStudioTransportKeyboardModeLive()).toBe("quick_rec");
    const listener = vi.fn();
    const off = subscribeStudioTransportKeyboardMode(listener);
    setStudioTransportKeyboardModeLive("standard_daw");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readStudioTransportKeyboardModeLive()).toBe("standard_daw");
    off();
    setStudioTransportKeyboardModeLive("quick_rec");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

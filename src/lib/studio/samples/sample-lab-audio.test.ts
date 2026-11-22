import { afterEach, describe, expect, it, vi } from "vitest";

import { openLabEngine } from "./sample-lab-audio";

function stubMic() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  return track;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openLabEngine releases the mic when setup fails", () => {
  it("stops tracks and closes the context when the worklet fails to load", async () => {
    const track = stubMic();
    const close = vi.fn(async () => undefined);
    vi.stubGlobal(
      "AudioContext",
      class {
        audioWorklet = { addModule: vi.fn(async () => { throw new Error("worklet"); }) };
        close = close;
      },
    );
    await expect(openLabEngine({ stereo: false })).rejects.toThrow("worklet");
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops tracks when the AudioContext constructor throws", async () => {
    const track = stubMic();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("no audio");
        }
      },
    );
    await expect(openLabEngine({ stereo: true })).rejects.toThrow("no audio");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});

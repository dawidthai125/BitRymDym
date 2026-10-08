import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_AUDIO_INPUT_STORAGE_KEY,
  acquireMicStream,
  buildAudioTrackConstraints,
  mapGetUserMediaFailure,
  mapMediaDevicesToAudioInputs,
  readStoredAudioInputDeviceId,
  resolveSelectedInputDeviceId,
  studioDeviceErrorMessagePl,
  writeStoredAudioInputDeviceId,
} from "@/lib/studio/studio-input-devices";

describe("P5.8 device discovery", () => {
  it("filters audioinput and falls back empty labels", () => {
    const mapped = mapMediaDevicesToAudioInputs([
      { deviceId: "a", kind: "audioinput", label: "" },
      { deviceId: "b", kind: "audiooutput", label: "Speakers" },
      { deviceId: "c", kind: "audioinput", label: "USB Mic" },
    ]);
    expect(mapped).toEqual([
      { deviceId: "a", label: "Mikrofon 1" },
      { deviceId: "c", label: "USB Mic" },
    ]);
  });

  it("handles empty device list", () => {
    expect(mapMediaDevicesToAudioInputs([])).toEqual([]);
  });
});

describe("P5.8 selection + stale fallback", () => {
  it("keeps Automatic (null) when no preference — AUD-01", () => {
    const r = resolveSelectedInputDeviceId({
      preferredId: null,
      inputs: [
        { deviceId: "d1", label: "A" },
        { deviceId: "d2", label: "B" },
      ],
    });
    expect(r).toEqual({ selectedId: null, fellBackFromStale: false });
  });

  it("keeps valid preferred device", () => {
    const r = resolveSelectedInputDeviceId({
      preferredId: "d2",
      inputs: [
        { deviceId: "d1", label: "A" },
        { deviceId: "d2", label: "B" },
      ],
    });
    expect(r.selectedId).toBe("d2");
    expect(r.fellBackFromStale).toBe(false);
  });

  it("falls back to Automatic when stored device missing — AUD-01", () => {
    const r = resolveSelectedInputDeviceId({
      preferredId: "gone",
      inputs: [{ deviceId: "d1", label: "A" }],
    });
    expect(r).toEqual({ selectedId: null, fellBackFromStale: true });
  });

  it("stale preference with empty list does not crash", () => {
    const r = resolveSelectedInputDeviceId({
      preferredId: "gone",
      inputs: [],
    });
    expect(r.selectedId).toBeNull();
    expect(r.fellBackFromStale).toBe(true);
  });
});

describe("P5.8 localStorage persistence", () => {
  it("reads and writes per-origin preference without backend", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    expect(readStoredAudioInputDeviceId(storage)).toBeNull();
    writeStoredAudioInputDeviceId(storage, "mic-1");
    expect(store.get(STUDIO_AUDIO_INPUT_STORAGE_KEY)).toBe("mic-1");
    expect(readStoredAudioInputDeviceId(storage)).toBe("mic-1");
    writeStoredAudioInputDeviceId(storage, null);
    expect(store.has(STUDIO_AUDIO_INPUT_STORAGE_KEY)).toBe(false);
  });
});

describe("P5.8 permission / error mapping", () => {
  it("maps DOMException names to stable codes", () => {
    expect(mapGetUserMediaFailure({ name: "NotAllowedError" })).toEqual({
      code: "DEVICE_PERMISSION_DENIED",
      permission: "DENIED",
    });
    expect(mapGetUserMediaFailure({ name: "SecurityError" })).toEqual({
      code: "DEVICE_PERMISSION_BLOCKED",
      permission: "BLOCKED",
    });
    expect(mapGetUserMediaFailure({ name: "NotFoundError" })).toEqual({
      code: "NO_INPUT_DEVICE",
      permission: "UNAVAILABLE",
    });
    expect(mapGetUserMediaFailure({ name: "OverconstrainedError" })).toEqual({
      code: "DEVICE_SELECTION_FAILED",
      permission: "GRANTED",
    });
  });

  it("exposes Polish messages by code not raw message", () => {
    expect(studioDeviceErrorMessagePl("DEVICE_PERMISSION_DENIED")).toMatch(
      /mikrofonu/i,
    );
    expect(studioDeviceErrorMessagePl("DEVICE_NOT_FOUND")).toMatch(
      /niedostępny|domyślnego/i,
    );
  });

  it("builds ideal constraints for preferred device", () => {
    expect(buildAudioTrackConstraints(null)).toBe(true);
    expect(buildAudioTrackConstraints("abc")).toEqual({
      deviceId: { ideal: "abc" },
    });
  });
});

describe("P5.8 acquireMicStream fallback", () => {
  it("falls back to default when preferred overconstrained", async () => {
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio;
      if (
        audio &&
        typeof audio === "object" &&
        audio.deviceId &&
        typeof audio.deviceId === "object" &&
        "ideal" in audio.deviceId
      ) {
        const err = new Error("over");
        err.name = "OverconstrainedError";
        throw err;
      }
      const track = {
        getSettings: () => ({ deviceId: "default-mic" }),
        stop: () => undefined,
      };
      return {
        getAudioTracks: () => [track],
        getTracks: () => [track],
      } as unknown as MediaStream;
    });

    const result = await acquireMicStream({
      getUserMedia,
      preferredDeviceId: "stale",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fellBack).toBe(true);
      expect(result.usedDeviceId).toBe("default-mic");
    }
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});

describe("P5.8 reuse / isolation guards", () => {
  it("panel uses device layer + existing analyser/recorder; no PlayerProvider / StudioAudioEngine", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/studio/studio-recording-panel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/useStudioInputDevices/);
    expect(panel).toMatch(/useMicAnalyser/);
    expect(panel).toMatch(/BrdInputMonitor/);
    expect(panel).toMatch(/TakeMediaRecorder/);
    expect(panel).toMatch(/reduceRecordingUi/);
    expect(panel).toMatch(/devicechange|useStudioInputDevices/);
    expect(panel).not.toMatch(/PlayerProvider/);
    expect(panel).not.toMatch(/StudioAudioEngine/);
    expect(panel).not.toMatch(/input_device_hint/);
    expect(panel).not.toMatch(/localStorage\.setItem/);
  });

  it("device helper never references backend persistence planes", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-input-devices.ts"),
      "utf8",
    );
    expect(mod).toMatch(/STUDIO_AUDIO_INPUT_STORAGE_KEY/);
    expect(mod).not.toMatch(/supabase/i);
    expect(mod).not.toMatch(/document_version/);
    expect(mod).not.toMatch(/input_device_hint/);
  });

  it("TakeMediaRecorder uses ideal deviceId (not exact)", () => {
    const recorder = readFileSync(
      join(process.cwd(), "src/lib/takes/media-recorder.ts"),
      "utf8",
    );
    expect(recorder).toMatch(/deviceId:\s*\{\s*ideal:/);
    expect(recorder).not.toMatch(/deviceId:\s*\{\s*exact:/);
  });
});

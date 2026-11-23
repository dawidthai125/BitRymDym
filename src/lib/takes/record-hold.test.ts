import { describe, expect, it, vi } from "vitest";

import { TakeMediaRecorder } from "@/lib/takes/media-recorder";
import {
  recordHoldFor,
  recordingSecondsLeft,
  shouldCancelArmingOnLeave,
} from "@/lib/takes/recording-ui-state";

function fakeMic() {
  const track = { readyState: "live", stop: vi.fn(() => { track.readyState = "ended"; }) };
  return { stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream, track };
}

class FakeRecorder {
  static isTypeSupported = () => true;
  static made = 0;
  state = "inactive";
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeRecorder.made += 1;
  }
  start() {
    this.state = "recording";
    this.onstart?.();
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

const deps = (getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>) => ({
  getUserMedia,
  MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
});

describe("cancel really stops the microphone", () => {
  it("while the count-in runs (mic open, recorder not started)", async () => {
    FakeRecorder.made = 0;
    const { stream, track } = fakeMic();
    const rec = new TakeMediaRecorder(deps(async () => stream));
    await rec.acquire();
    expect(rec.getStream()).toBe(stream);
    await rec.cancel();
    expect(track.stop).toHaveBeenCalled();
    expect(rec.getStream()).toBeNull();
    expect(FakeRecorder.made).toBe(0);
  });

  it("while the browser is still opening the microphone", async () => {
    FakeRecorder.made = 0;
    const { stream, track } = fakeMic();
    let open!: (s: MediaStream) => void;
    const rec = new TakeMediaRecorder(deps(() => new Promise((r) => { open = r; })));
    const started = rec.start();
    await rec.cancel();
    open(stream);
    await expect(started).rejects.toMatchObject({ code: "CANCELLED" });
    expect(track.stop).toHaveBeenCalled();
    expect(FakeRecorder.made).toBe(0);
  });

  it("start() records the stream opened before the count-in (one permission prompt)", async () => {
    const { stream } = fakeMic();
    const gum = vi.fn(async () => stream);
    const rec = new TakeMediaRecorder(deps(gum));
    await rec.acquire();
    await rec.start();
    expect(gum).toHaveBeenCalledTimes(1);
    expect(rec.isRecording).toBe(true);
    const done = await rec.stop();
    expect(done.blob).toBeInstanceOf(Blob);
  });
});

describe("record hold", () => {
  it("keeps the panel for a capture, a decision and an unsent take", () => {
    expect(recordHoldFor({ phase: "RECORDING", arming: false, unsentTake: false })).toBe("capture");
    expect(recordHoldFor({ phase: "READY", arming: true, unsentTake: false })).toBe("arming");
    expect(recordHoldFor({ phase: "REQUESTING_MIC", arming: false, unsentTake: false })).toBe("arming");
    expect(recordHoldFor({ phase: "UPLOADING", arming: false, unsentTake: false })).toBe("saving");
    expect(recordHoldFor({ phase: "READY_TAKE", arming: false, unsentTake: false })).toBe("decision");
    expect(recordHoldFor({ phase: "UPLOAD_ERROR", arming: false, unsentTake: true })).toBe("retry");
    expect(recordHoldFor({ phase: "IDLE", arming: false, unsentTake: false })).toBeNull();
  });

  it("leaving the view cancels only a take that has not started", () => {
    expect(shouldCancelArmingOnLeave({ phase: "REQUESTING_MIC", arming: false, visible: false })).toBe(true);
    expect(shouldCancelArmingOnLeave({ phase: "READY", arming: true, visible: false })).toBe(true);
    for (const phase of ["RECORDING", "STOPPING", "UPLOADING", "READY_TAKE"] as const) {
      expect(shouldCancelArmingOnLeave({ phase, arming: false, visible: false })).toBe(false);
    }
    expect(shouldCancelArmingOnLeave({ phase: "READY", arming: true, visible: true })).toBe(false);
  });

  it("warns in the last ten seconds of the plan limit", () => {
    expect(recordingSecondsLeft({ elapsedMs: 10_000, maxSeconds: 30 })).toBeNull();
    expect(recordingSecondsLeft({ elapsedMs: 22_500, maxSeconds: 30 })).toBe(8);
    expect(recordingSecondsLeft({ elapsedMs: 31_000, maxSeconds: 30 })).toBe(0);
  });
});

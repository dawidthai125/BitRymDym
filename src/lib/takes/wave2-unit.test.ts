import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import {
  assertTakeRecordAccess,
  computeInterimRecordingMaxSeconds,
  recordingModeForMaxSeconds,
  rejectClientChosenTakeStorageParams,
  retentionSecondsForAccountLevel,
  TakeAuthzError,
} from "@/lib/takes/authz";
import {
  detectMediaRecorderSupport,
  TakeMediaRecorder,
  TakeRecorderError,
} from "@/lib/takes/media-recorder";
import {
  normalizeTakeContentType,
  pickSupportedMediaRecorderMime,
  validateTakeUploadMeta,
} from "@/lib/takes/validation";

function ctx(overrides?: Partial<AuthContext>): AuthContext {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    userId,
    email: "a@test",
    profile: {
      id: userId,
      displayName: "A",
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
    ...overrides,
  };
}

describe("Recording Wave 2 — AuthZ interim", () => {
  it("computes max as MIN(beat, 180)", () => {
    expect(computeInterimRecordingMaxSeconds(30)).toBe(30);
    expect(computeInterimRecordingMaxSeconds(240)).toBe(180);
  });

  it("allows PUBLISHED only", () => {
    // BEGINNER entitlement: MIN(beat, 30)
    expect(
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 60 },
      }).maxRecordingSeconds,
    ).toBe(30);

    for (const status of ["DRAFT", "REJECTED", "ARCHIVED", "PENDING_REVIEW"]) {
      expect(() =>
        assertTakeRecordAccess({
          context: ctx(),
          beat: { id: "b", status, durationSeconds: 60 },
        }),
      ).toThrow(TakeAuthzError);
    }
  });

  it("rejects client-chosen storage identity", () => {
    expect(() =>
      rejectClientChosenTakeStorageParams({ objectKey: "evil" }),
    ).toThrow(/must not supply/i);
    expect(() =>
      rejectClientChosenTakeStorageParams({ ownerId: "x" }),
    ).toThrow(/must not supply/i);
    expect(() =>
      rejectClientChosenTakeStorageParams({}),
    ).not.toThrow();
  });

  it("maps retention and recording mode", () => {
    expect(retentionSecondsForAccountLevel("BEGINNER_RAPPER")).toBe(
      24 * 60 * 60,
    );
    expect(recordingModeForMaxSeconds(30)).toBe("QUICK");
    expect(recordingModeForMaxSeconds(31)).toBe("FULL");
  });
});

describe("Recording Wave 2 — take MIME validation", () => {
  it("normalizes codecs suffix and validates allow-list", () => {
    expect(normalizeTakeContentType("audio/webm;codecs=opus")).toBe(
      "audio/webm",
    );
    expect(normalizeTakeContentType("video/webm")).toBeNull();
    expect(
      validateTakeUploadMeta({
        contentType: "audio/webm;codecs=opus",
        byteSize: 1024,
      }),
    ).toEqual({ ok: true, contentType: "audio/webm" });
    expect(
      validateTakeUploadMeta({
        contentType: "application/octet-stream",
        byteSize: 10,
      }).ok,
    ).toBe(false);
  });

  it("picks first supported MediaRecorder MIME", () => {
    expect(
      pickSupportedMediaRecorderMime((t) => t === "audio/mp4"),
    ).toBe("audio/mp4");
    expect(pickSupportedMediaRecorderMime(() => false)).toBeNull();
  });
});

describe("Recording Wave 2 — MediaRecorder module", () => {
  it("reports unsupported when MediaDevices missing", () => {
    expect(
      detectMediaRecorderSupport({
        getUserMedia: undefined,
        MediaRecorderCtor: undefined,
      }),
    ).toEqual({ supported: false, reason: "NO_MEDIA_DEVICES" });
  });

  it("reports unsupported when no MIME", () => {
    const FakeMR = function () {} as unknown as typeof MediaRecorder;
    (FakeMR as unknown as { isTypeSupported: () => boolean }).isTypeSupported =
      () => false;
    expect(
      detectMediaRecorderSupport({
        getUserMedia: async () =>
          ({ getTracks: () => [] }) as unknown as MediaStream,
        MediaRecorderCtor: FakeMR,
        isTypeSupported: () => false,
      }),
    ).toEqual({ supported: false, reason: "NO_MIME" });
  });

  it("permission denied maps to PERMISSION_DENIED", async () => {
    const FakeMR = vi.fn() as unknown as typeof MediaRecorder;
    (FakeMR as unknown as { isTypeSupported: () => boolean }).isTypeSupported =
      () => true;
    const recorder = new TakeMediaRecorder({
      getUserMedia: async () => {
        const err = new Error("denied");
        err.name = "NotAllowedError";
        throw err;
      },
      MediaRecorderCtor: FakeMR,
      isTypeSupported: (t) => t.startsWith("audio/webm"),
    });
    await expect(recorder.start()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("unsupported browser path", async () => {
    const recorder = new TakeMediaRecorder({
      getUserMedia: undefined,
    });
    await expect(recorder.start()).rejects.toBeInstanceOf(TakeRecorderError);
    await expect(recorder.start()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("stop assembles chunks into Blob", async () => {
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;

    type Handler = ((ev: BlobEvent) => void) | null;
    let ondata: Handler = null;
    let onstop: (() => void) | null = null;
    let onerror: (() => void) | null = null;

    class FakeMediaRecorder {
      state = "inactive";
      ondataavailable: Handler = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(
        public stream: MediaStream,
        public opts?: { mimeType?: string },
      ) {}
      start() {
        this.state = "recording";
        ondata = this.ondataavailable;
        onstop = this.onstop;
        onerror = this.onerror;
        queueMicrotask(() => {
          ondata?.({
            data: new Blob(["abc"], { type: "audio/webm" }),
          } as BlobEvent);
        });
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          onstop?.();
        });
      }
      static isTypeSupported(t: string) {
        return t === "audio/webm";
      }
    }

    const recorder = new TakeMediaRecorder({
      getUserMedia: async () => stream,
      MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      isTypeSupported: (t) => t === "audio/webm",
      now: () => 1000,
    });

    const started = await recorder.start();
    expect(started.mimeType).toBe("audio/webm");
    // Allow dataavailable microtask
    await Promise.resolve();
    const result = await recorder.stop();
    expect(result.mimeType).toBe("audio/webm");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(tracks[0]!.stop).toHaveBeenCalled();
    void onerror;
  });

  it("cancel during stop rejects with CANCELLED", async () => {
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    let onstop: (() => void) | null = null;

    class FakeMediaRecorder {
      state = "inactive";
      ondataavailable: ((ev: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        this.state = "recording";
        onstop = () => this.onstop?.();
      }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        queueMicrotask(() => onstop?.());
      }
      static isTypeSupported() {
        return true;
      }
    }

    const recorder = new TakeMediaRecorder({
      getUserMedia: async () => stream,
      MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      isTypeSupported: () => true,
    });
    await recorder.start();
    const stopPromise = recorder.stop();
    recorder.cancel();
    await expect(stopPromise).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("recording error from MediaRecorder onerror", async () => {
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks } as unknown as MediaStream;
    let fireError: (() => void) | undefined;

    class FakeMediaRecorder {
      state = "inactive";
      ondataavailable: ((ev: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        this.state = "recording";
        fireError = () => this.onerror?.();
      }
      stop() {
        this.state = "inactive";
      }
      static isTypeSupported() {
        return true;
      }
    }

    const recorder = new TakeMediaRecorder({
      getUserMedia: async () => stream,
      MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      isTypeSupported: () => true,
    });
    await recorder.start();
    const stopPromise = recorder.stop();
    fireError!();
    await expect(stopPromise).rejects.toMatchObject({
      code: "RECORDING_ERROR",
    });
  });
});

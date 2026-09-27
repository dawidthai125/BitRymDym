/**
 * Recording Wave 2 — browser MediaRecorder capture helper.
 * No PlaybackShell / product QT UI. Technical surface for transport + W3 wiring.
 */

import { pickSupportedMediaRecorderMime } from "@/lib/takes/validation";

export type MediaRecorderSupport =
  | { supported: true; mimeType: string }
  | {
      supported: false;
      reason: "NO_MEDIA_DEVICES" | "NO_MEDIA_RECORDER" | "NO_MIME";
    };

export type TakeRecorderErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "RECORDING_ERROR"
  | "CANCELLED"
  | "NOT_RECORDING"
  | "ALREADY_RECORDING";

export class TakeRecorderError extends Error {
  readonly code: TakeRecorderErrorCode;
  constructor(code: TakeRecorderErrorCode, message: string) {
    super(message);
    this.name = "TakeRecorderError";
    this.code = code;
  }
}

export type TakeRecorderResult = {
  blob: Blob;
  mimeType: string;
  /** Client-local elapsed ms — NOT server source of truth. */
  clientElapsedMs: number;
};

type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

export type TakeRecorderDeps = {
  getUserMedia?: GetUserMedia;
  MediaRecorderCtor?: typeof MediaRecorder;
  isTypeSupported?: (type: string) => boolean;
  now?: () => number;
};

function resolveDeps(deps?: TakeRecorderDeps) {
  const getUserMedia =
    deps?.getUserMedia ??
    (typeof navigator !== "undefined"
      ? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
      : undefined);
  const MediaRecorderCtor =
    deps?.MediaRecorderCtor ??
    (typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined);
  const isTypeSupported =
    deps?.isTypeSupported ??
    (MediaRecorderCtor?.isTypeSupported?.bind(MediaRecorderCtor) as
      | ((type: string) => boolean)
      | undefined);
  const now = deps?.now ?? (() => Date.now());
  return { getUserMedia, MediaRecorderCtor, isTypeSupported, now };
}

export function detectMediaRecorderSupport(
  deps?: TakeRecorderDeps,
): MediaRecorderSupport {
  const { getUserMedia, MediaRecorderCtor, isTypeSupported } =
    resolveDeps(deps);
  if (!getUserMedia) {
    return { supported: false, reason: "NO_MEDIA_DEVICES" };
  }
  if (!MediaRecorderCtor || !isTypeSupported) {
    return { supported: false, reason: "NO_MEDIA_RECORDER" };
  }
  const mimeType = pickSupportedMediaRecorderMime(isTypeSupported);
  if (!mimeType) {
    return { supported: false, reason: "NO_MIME" };
  }
  return { supported: true, mimeType };
}

/**
 * Stateful microphone recorder. One active session at a time per instance.
 */
export class TakeMediaRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private mimeType = "";
  private stopResolver: ((result: TakeRecorderResult) => void) | null = null;
  private stopRejecter: ((error: TakeRecorderError) => void) | null = null;
  private cancelled = false;

  constructor(private readonly deps: TakeRecorderDeps = {}) {}

  get isRecording(): boolean {
    return this.recorder != null && this.recorder.state !== "inactive";
  }

  async start(): Promise<{ mimeType: string }> {
    if (this.isRecording) {
      throw new TakeRecorderError(
        "ALREADY_RECORDING",
        "Recorder is already active.",
      );
    }

    const support = detectMediaRecorderSupport(this.deps);
    if (!support.supported) {
      throw new TakeRecorderError(
        "UNSUPPORTED",
        `MediaRecorder unavailable (${support.reason}).`,
      );
    }

    const { getUserMedia, MediaRecorderCtor, now } = resolveDeps(this.deps);
    if (!getUserMedia || !MediaRecorderCtor) {
      throw new TakeRecorderError(
        "UNSUPPORTED",
        "MediaRecorder unavailable.",
      );
    }

    try {
      this.stream = await getUserMedia({
        audio: true,
        video: false,
      });
    } catch (error) {
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name: string }).name)
          : "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError"
      ) {
        throw new TakeRecorderError(
          "PERMISSION_DENIED",
          "Microphone permission denied.",
        );
      }
      throw new TakeRecorderError(
        "RECORDING_ERROR",
        error instanceof Error ? error.message : "getUserMedia failed.",
      );
    }

    this.chunks = [];
    this.cancelled = false;
    this.mimeType = support.mimeType;
    this.startedAt = now();

    try {
      this.recorder = new MediaRecorderCtor(this.stream, {
        mimeType: support.mimeType,
      });
    } catch (error) {
      this.cleanupStream();
      throw new TakeRecorderError(
        "RECORDING_ERROR",
        error instanceof Error
          ? error.message
          : "Failed to construct MediaRecorder.",
      );
    }

    this.recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.recorder.onerror = () => {
      const err = new TakeRecorderError(
        "RECORDING_ERROR",
        "MediaRecorder error.",
      );
      if (this.stopRejecter) {
        this.stopRejecter(err);
        this.clearStopHandlers();
      }
      this.cleanupStream();
      this.recorder = null;
    };

    this.recorder.onstop = () => {
      if (this.cancelled) {
        this.cleanupStream();
        this.recorder = null;
        this.chunks = [];
        if (this.stopRejecter) {
          this.stopRejecter(
            new TakeRecorderError("CANCELLED", "Recording was cancelled."),
          );
          this.clearStopHandlers();
        }
        return;
      }

      if (!this.stopResolver) {
        this.cleanupStream();
        this.recorder = null;
        this.chunks = [];
        return;
      }

      const { now: clock } = resolveDeps(this.deps);
      const blob = new Blob(this.chunks, { type: this.mimeType });
      const result: TakeRecorderResult = {
        blob,
        mimeType: this.mimeType,
        clientElapsedMs: Math.max(0, clock() - this.startedAt),
      };
      this.cleanupStream();
      this.recorder = null;
      this.chunks = [];
      this.stopResolver(result);
      this.clearStopHandlers();
    };

    this.recorder.start(250);
    return { mimeType: support.mimeType };
  }

  stop(): Promise<TakeRecorderResult> {
    if (!this.recorder || this.recorder.state === "inactive") {
      return Promise.reject(
        new TakeRecorderError("NOT_RECORDING", "No active recording."),
      );
    }

    const recorder = this.recorder;

    return new Promise<TakeRecorderResult>((resolve, reject) => {
      this.stopResolver = resolve;
      this.stopRejecter = reject;

      try {
        recorder.stop();
      } catch (error) {
        this.cleanupStream();
        this.recorder = null;
        reject(
          new TakeRecorderError(
            "RECORDING_ERROR",
            error instanceof Error ? error.message : "stop failed.",
          ),
        );
        this.clearStopHandlers();
      }
    });
  }

  /** Abort without producing a Blob for upload. */
  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        this.cleanupStream();
        this.recorder = null;
        this.chunks = [];
      }
      return;
    }
    this.cleanupStream();
    this.recorder = null;
    this.chunks = [];
  }

  private clearStopHandlers() {
    this.stopResolver = null;
    this.stopRejecter = null;
  }

  private cleanupStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
  }
}

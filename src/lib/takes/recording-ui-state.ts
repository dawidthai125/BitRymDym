/**
 * Recording Wave 3 — pure UI state machine (no DOM / MediaRecorder).
 * Server AuthZ remains source of truth; this is UX only.
 */

export type RecordingUiPhase =
  | "IDLE"
  | "REQUESTING_MIC"
  | "READY"
  | "RECORDING"
  | "STOPPING"
  | "UPLOADING"
  | "PROCESSING"
  | "READY_TAKE"
  | "MIC_DENIED"
  | "UNSUPPORTED"
  | "RECORDING_ERROR"
  | "UPLOAD_ERROR"
  | "FINALIZE_ERROR"
  | "EXPIRED"
  | "AUTH_REQUIRED"
  | "BEAT_NOT_ELIGIBLE";

export type RecordingUiSnapshot = {
  phase: RecordingUiPhase;
  error: string | null;
  /** Client-local elapsed ms while RECORDING — not server SOT. */
  elapsedMs: number;
  /** Display hint from beat; server still enforces. */
  maxRecordingSeconds: number;
  takeId: string | null;
  previewUrl: string | null;
  takeDurationSeconds: number | null;
};

export type RecordingUiEvent =
  | { type: "REQUIRE_AUTH" }
  | { type: "BEAT_INELIGIBLE"; message?: string }
  | { type: "REQUEST_MIC" }
  | { type: "MIC_READY" }
  | { type: "MIC_DENIED"; message?: string }
  | { type: "UNSUPPORTED"; message?: string }
  | { type: "START_RECORDING" }
  | { type: "TICK"; elapsedMs: number }
  | { type: "STOP" }
  | { type: "UPLOAD_START" }
  | { type: "FINALIZE_START" }
  | {
      type: "TAKE_READY";
      takeId: string;
      previewUrl: string | null;
      takeDurationSeconds: number | null;
    }
  | { type: "RECORDING_FAILED"; message?: string }
  | { type: "UPLOAD_FAILED"; message?: string }
  | { type: "FINALIZE_FAILED"; message?: string }
  | { type: "EXPIRED"; message?: string }
  | { type: "PREVIEW_URL"; previewUrl: string }
  | { type: "RESET" }
  | { type: "RETRY_IDLE" };

export function createInitialRecordingUiSnapshot(params?: {
  maxRecordingSeconds?: number;
}): RecordingUiSnapshot {
  return {
    phase: "IDLE",
    error: null,
    elapsedMs: 0,
    maxRecordingSeconds: params?.maxRecordingSeconds ?? 180,
    takeId: null,
    previewUrl: null,
    takeDurationSeconds: null,
  };
}

export function reduceRecordingUi(
  state: RecordingUiSnapshot,
  event: RecordingUiEvent,
): RecordingUiSnapshot {
  switch (event.type) {
    case "REQUIRE_AUTH":
      return {
        ...state,
        phase: "AUTH_REQUIRED",
        error: "Zaloguj się, aby nagrywać.",
      };
    case "BEAT_INELIGIBLE":
      return {
        ...state,
        phase: "BEAT_NOT_ELIGIBLE",
        error: event.message ?? "Nagrywanie niedostępne dla tego bitu.",
      };
    case "REQUEST_MIC":
      if (
        state.phase !== "IDLE" &&
        state.phase !== "READY" &&
        state.phase !== "MIC_DENIED" &&
        state.phase !== "UNSUPPORTED" &&
        state.phase !== "RECORDING_ERROR" &&
        state.phase !== "UPLOAD_ERROR" &&
        state.phase !== "FINALIZE_ERROR" &&
        state.phase !== "READY_TAKE"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "REQUESTING_MIC",
        error: null,
        elapsedMs: 0,
        takeId: null,
        previewUrl: null,
        takeDurationSeconds: null,
      };
    case "MIC_READY":
      if (state.phase !== "REQUESTING_MIC") return state;
      return { ...state, phase: "READY", error: null };
    case "MIC_DENIED":
      return {
        ...state,
        phase: "MIC_DENIED",
        error: event.message ?? "Brak dostępu do mikrofonu.",
      };
    case "UNSUPPORTED":
      return {
        ...state,
        phase: "UNSUPPORTED",
        error: event.message ?? "Nagrywanie nie jest obsługiwane w tej przeglądarce.",
      };
    case "START_RECORDING":
      if (state.phase !== "READY") {
        return state;
      }
      return {
        ...state,
        phase: "RECORDING",
        error: null,
        elapsedMs: 0,
      };
    case "TICK":
      if (state.phase !== "RECORDING") return state;
      return { ...state, elapsedMs: Math.max(0, event.elapsedMs) };
    case "STOP":
      if (state.phase !== "RECORDING") return state;
      return { ...state, phase: "STOPPING", error: null };
    case "UPLOAD_START":
      // Mic path: STOPPING/RECORDING. Studio vocal file import: IDLE and recovery phases.
      if (
        state.phase !== "STOPPING" &&
        state.phase !== "RECORDING" &&
        state.phase !== "IDLE" &&
        state.phase !== "READY" &&
        state.phase !== "UPLOAD_ERROR" &&
        state.phase !== "FINALIZE_ERROR" &&
        state.phase !== "RECORDING_ERROR" &&
        state.phase !== "MIC_DENIED" &&
        state.phase !== "UNSUPPORTED" &&
        state.phase !== "BEAT_NOT_ELIGIBLE"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "UPLOADING",
        error: null,
        takeId: null,
        previewUrl: null,
        takeDurationSeconds: null,
      };
    case "FINALIZE_START":
      if (state.phase !== "UPLOADING") return state;
      return { ...state, phase: "PROCESSING", error: null };
    case "TAKE_READY":
      return {
        ...state,
        phase: "READY_TAKE",
        error: null,
        takeId: event.takeId,
        previewUrl: event.previewUrl,
        takeDurationSeconds: event.takeDurationSeconds,
      };
    case "RECORDING_FAILED":
      return {
        ...state,
        phase: "RECORDING_ERROR",
        error: event.message ?? "Błąd nagrywania.",
      };
    case "UPLOAD_FAILED":
      return {
        ...state,
        phase: "UPLOAD_ERROR",
        error: event.message ?? "Błąd przesyłania nagrania.",
      };
    case "FINALIZE_FAILED":
      return {
        ...state,
        phase: "FINALIZE_ERROR",
        error: event.message ?? "Błąd finalizacji nagrania.",
      };
    case "EXPIRED":
      return {
        ...state,
        phase: "EXPIRED",
        error: event.message ?? "Sesja nagrania wygasła.",
      };
    case "PREVIEW_URL":
      return { ...state, previewUrl: event.previewUrl };
    case "RESET":
      return createInitialRecordingUiSnapshot({
        maxRecordingSeconds: state.maxRecordingSeconds,
      });
    case "RETRY_IDLE":
      return {
        ...createInitialRecordingUiSnapshot({
          maxRecordingSeconds: state.maxRecordingSeconds,
        }),
        phase: "IDLE",
      };
    default:
      return state;
  }
}

export function isRecordingBusy(phase: RecordingUiPhase): boolean {
  return (
    phase === "REQUESTING_MIC" ||
    phase === "RECORDING" ||
    phase === "STOPPING" ||
    phase === "UPLOADING" ||
    phase === "PROCESSING"
  );
}

/**
 * Capture / finalize in flight — the host must keep StudioRecordingPanel
 * mounted (unmount cancels the recorder). READY_TAKE and errors are not active.
 */
export function isRecordingCaptureActive(phase: RecordingUiPhase): boolean {
  return (
    phase === "RECORDING" ||
    phase === "STOPPING" ||
    phase === "UPLOADING" ||
    phase === "PROCESSING"
  );
}

/**
 * Notice when the recording panel unmounts mid-capture. RECORDING / STOPPING:
 * the recorder is cancelled and the take is lost. UPLOADING / PROCESSING: the
 * upload continues without UI and the Take lands in the library if it succeeds.
 */
export function recordingInterruptedNoticePl(
  phase: RecordingUiPhase,
  options?: { locallySecured?: boolean },
): string | null {
  if (phase === "RECORDING" || phase === "STOPPING") {
    if (options?.locallySecured) {
      return "Nagrywanie przerwane — panel nagrywania został zamknięty. Nagranie nie zostało zapisane na serwerze, ale jego część jest zabezpieczona lokalnie — możesz ją odzyskać.";
    }
    return "Nagrywanie przerwane — panel nagrywania został zamknięty. Nagranie nie zostało zapisane.";
  }
  if (phase === "UPLOADING" || phase === "PROCESSING") {
    return "Panel nagrywania został zamknięty podczas zapisu. Jeśli zapis się powiedzie, nagranie znajdziesz na liście „Moje nagrania”.";
  }
  return null;
}

export function canStartNewRecording(phase: RecordingUiPhase): boolean {
  return (
    phase === "IDLE" ||
    phase === "READY" ||
    phase === "READY_TAKE" ||
    phase === "MIC_DENIED" ||
    phase === "UNSUPPORTED" ||
    phase === "RECORDING_ERROR" ||
    phase === "UPLOAD_ERROR" ||
    phase === "FINALIZE_ERROR" ||
    phase === "EXPIRED"
  );
}

/**
 * Top-bar REC (studio transport) — one press must behave like a DAW record key,
 * not only open the recording panel (prod bug 2026-10-30: REC looked dead).
 * IDLE/error → prepare mic then auto-start; READY → start; RECORDING → stop.
 * READY_TAKE (keep/discard decision) and in-flight phases → no-op.
 */
export type TransportRecordAction =
  | "start"
  | "stop"
  | "prepare-then-start"
  | "none";

export function transportRecordAction(
  phase: RecordingUiPhase,
  hasTrack: boolean,
): TransportRecordAction {
  if (phase === "RECORDING") return "stop";
  if (!hasTrack) return "none";
  if (phase === "READY") return "start";
  if (phase === "READY_TAKE") return "none";
  if (canStartNewRecording(phase)) return "prepare-then-start";
  return "none";
}

/**
 * Why the record panel must stay mounted although its view was left (tab, step, width).
 * arming = mic prompt or count-in, capture = recording, saving = upload in flight,
 * decision = a finished take waits for Zachowaj / Odrzuć, retry = the take was not uploaded yet.
 */
export type RecordHold = "arming" | "capture" | "saving" | "decision" | "retry" | null;

export function recordHoldFor(input: {
  phase: RecordingUiPhase;
  /** Mic prompt / count-in of a take that is about to start. */
  arming: boolean;
  /** A finished recording is kept in memory because the upload failed. */
  unsentTake: boolean;
}): RecordHold {
  if (input.phase === "RECORDING") return "capture";
  if (input.arming || input.phase === "REQUESTING_MIC") return "arming";
  if (isRecordingBusy(input.phase)) return "saving";
  if (input.phase === "READY_TAKE") return "decision";
  if (input.unsentTake) return "retry";
  return null;
}

/** A take that is only being prepared is called off when the user leaves the record view. */
export function shouldCancelArmingOnLeave(input: {
  phase: RecordingUiPhase;
  arming: boolean;
  visible: boolean;
}): boolean {
  if (input.visible) return false;
  return input.phase === "REQUESTING_MIC" || (input.phase === "READY" && input.arming);
}

/** Seconds left before the plan limit, shown only near the end of a take. */
export function recordingSecondsLeft(input: {
  elapsedMs: number;
  maxSeconds: number;
  warnSeconds?: number;
}): number | null {
  const left = Math.ceil(input.maxSeconds - input.elapsedMs / 1000);
  return left <= (input.warnSeconds ?? 10) ? Math.max(0, left) : null;
}

export function displayMaxRecordingSeconds(beatDurationSeconds: number): number {
  if (
    typeof beatDurationSeconds !== "number" ||
    !Number.isFinite(beatDurationSeconds) ||
    beatDurationSeconds <= 0
  ) {
    return 180;
  }
  return Math.min(Math.floor(beatDurationSeconds), 180);
}

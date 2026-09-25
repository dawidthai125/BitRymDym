/**
 * Pure playback UI state machine — unit-testable without DOM.
 * HTMLAudioElement is the engine; this module never touches it.
 */

export type PlaybackPhase =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

export type PlaybackSnapshot = {
  phase: PlaybackPhase;
  error: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
};

export type PlaybackEvent =
  | { type: "REQUEST_PLAY" }
  | { type: "URL_READY" }
  | { type: "URL_FAILED"; message: string }
  | { type: "PLAYING" }
  | { type: "PAUSED" }
  | { type: "ENDED" }
  | { type: "ENGINE_ERROR"; message: string }
  | { type: "TIME"; currentTime: number; duration: number }
  | { type: "VOLUME"; volume: number }
  | { type: "MUTE"; muted: boolean }
  | { type: "RESET" };

export function createInitialPlaybackSnapshot(): PlaybackSnapshot {
  return {
    phase: "idle",
    error: null,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  };
}

export function reducePlayback(
  state: PlaybackSnapshot,
  event: PlaybackEvent,
): PlaybackSnapshot {
  switch (event.type) {
    case "REQUEST_PLAY":
      return {
        ...state,
        phase: "loading",
        error: null,
      };
    case "URL_READY":
      return {
        ...state,
        phase: state.phase === "loading" ? "ready" : state.phase,
        error: null,
      };
    case "URL_FAILED":
      return {
        ...state,
        phase: "error",
        error: event.message,
      };
    case "PLAYING":
      return {
        ...state,
        phase: "playing",
        error: null,
      };
    case "PAUSED":
      return {
        ...state,
        phase: "paused",
      };
    case "ENDED":
      return {
        ...state,
        phase: "paused",
        currentTime: 0,
      };
    case "ENGINE_ERROR":
      return {
        ...state,
        phase: "error",
        error: event.message,
      };
    case "TIME":
      return {
        ...state,
        currentTime: event.currentTime,
        duration: event.duration > 0 ? event.duration : state.duration,
      };
    case "VOLUME":
      return {
        ...state,
        volume: Math.min(1, Math.max(0, event.volume)),
      };
    case "MUTE":
      return {
        ...state,
        muted: event.muted,
      };
    case "RESET":
      return createInitialPlaybackSnapshot();
    default:
      return state;
  }
}

export function canTogglePlay(phase: PlaybackPhase): boolean {
  return phase !== "loading";
}

export function isPlayLabel(phase: PlaybackPhase): boolean {
  return phase === "idle" || phase === "paused" || phase === "ready" || phase === "error";
}

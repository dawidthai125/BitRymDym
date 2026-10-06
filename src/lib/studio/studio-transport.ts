/**
 * P5 StudioTransport — project timeline playhead.
 * Distinct from PlayerProvider (catalog beat playback).
 */

import { clampPlayheadMs } from "@/lib/studio/studio-time";

export type StudioTransportPhase = "stopped" | "playing" | "paused";

export type StudioTransportState = {
  phase: StudioTransportPhase;
  playheadMs: number;
  timelineLengthMs: number;
};

export type StudioTransportEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "SEEK"; playheadMs: number }
  | { type: "TICK"; deltaMs: number }
  | { type: "SET_LENGTH"; timelineLengthMs: number };

export function createStudioTransportState(
  timelineLengthMs: number,
): StudioTransportState {
  return {
    phase: "stopped",
    playheadMs: 0,
    timelineLengthMs,
  };
}

export function reduceStudioTransport(
  state: StudioTransportState,
  event: StudioTransportEvent,
): StudioTransportState {
  switch (event.type) {
    case "PLAY":
      return { ...state, phase: "playing" };
    case "PAUSE":
      return state.phase === "stopped"
        ? state
        : { ...state, phase: "paused" };
    case "STOP":
      return { ...state, phase: "stopped", playheadMs: 0 };
    case "SEEK":
      return {
        ...state,
        playheadMs: clampPlayheadMs(event.playheadMs, state.timelineLengthMs),
      };
    case "SET_LENGTH":
      return {
        ...state,
        timelineLengthMs: event.timelineLengthMs,
        playheadMs: clampPlayheadMs(state.playheadMs, event.timelineLengthMs),
      };
    case "TICK": {
      if (state.phase !== "playing") return state;
      const next = clampPlayheadMs(
        state.playheadMs + event.deltaMs,
        state.timelineLengthMs,
      );
      if (next >= state.timelineLengthMs) {
        return { ...state, phase: "stopped", playheadMs: state.timelineLengthMs };
      }
      return { ...state, playheadMs: next };
    }
    default:
      return state;
  }
}

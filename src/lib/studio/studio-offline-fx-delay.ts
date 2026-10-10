/**
 * SFM-3D — Offline delay matching live buildDelaySlot topology:
 *   dry || (Delay → wet)
 *   Delay → feedback → Delay
 * createDelay(max=2s); timeMs ∈ [1,2000]; feedback ∈ [0,0.95]; mix ∈ [0,1]
 * No BPM sync (not in Studio FX contract).
 */

import type { StudioFxDelayParams } from "@/lib/studio/studio-fx-chain";

/** Max delay seconds from live createDelay(2) / validator timeMs≤2000. */
export const STUDIO_OFFLINE_DELAY_MAX_SECONDS = 2;

export type DelayLineState = {
  left: Float32Array;
  right: Float32Array;
  writeIndex: number;
  capacity: number;
};

export function delayBufferBytes(sampleRate: number, timeMs: number): number {
  const samples = delaySamplesForTimeMs(sampleRate, timeMs);
  // capacity = max(delay,1)+1 headroom; stereo float32
  const capacity = Math.max(samples, 1) + 1;
  return capacity * 2 * 4;
}

export function delaySamplesForTimeMs(
  sampleRate: number,
  timeMs: number,
): number {
  const t = Math.min(
    STUDIO_OFFLINE_DELAY_MAX_SECONDS,
    Math.max(0, timeMs) / 1000,
  );
  return Math.max(1, Math.round(t * sampleRate));
}

export function createDelayLineState(
  sampleRate: number,
  timeMs: number,
): DelayLineState {
  const delaySamples = delaySamplesForTimeMs(sampleRate, timeMs);
  const capacity = delaySamples + 1;
  return {
    left: new Float32Array(capacity),
    right: new Float32Array(capacity),
    writeIndex: 0,
    capacity,
  };
}

function sanitize(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/**
 * One stereo sample through feedback delay + wet/dry mix (live graph order).
 */
export function processDelaySample(
  left: number,
  right: number,
  params: StudioFxDelayParams,
  state: DelayLineState,
  sampleRate: number,
): { left: number; right: number } {
  const xL = sanitize(left);
  const xR = sanitize(right);
  const mix = Math.max(0, Math.min(1, params.mix));
  const fb = Math.max(0, Math.min(0.95, params.feedback));
  const delaySamples = Math.min(
    state.capacity - 1,
    delaySamplesForTimeMs(sampleRate, params.timeMs),
  );
  const readIndex =
    (state.writeIndex - delaySamples + state.capacity) % state.capacity;
  const yL = state.left[readIndex] ?? 0;
  const yR = state.right[readIndex] ?? 0;

  state.left[state.writeIndex] = xL + fb * yL;
  state.right[state.writeIndex] = xR + fb * yR;
  state.writeIndex = (state.writeIndex + 1) % state.capacity;

  return {
    left: sanitize((1 - mix) * xL + mix * yL),
    right: sanitize((1 - mix) * xR + mix * yR),
  };
}

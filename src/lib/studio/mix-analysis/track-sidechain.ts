/**
 * User sidechain („Ścisz pod bit”) in the mix sum, modelled on the live engine
 * (studio-audio-engine applySidechain): the key is the peak of the BEAT track after
 * its strip, followed with attack/release; the duck sits after the track pan.
 * The engine looks at the last 256 samples of the analyser (48 kHz) — so do these blocks.
 */

import { sidechainParamsOf, type StudioFxSidechainParams } from "@/lib/studio/studio-fx-chain";

const BLOCK_SEC = 256 / 48000;

export type SidechainTrack = { trackType?: string; effectsChain?: unknown };

type Chain = Parameters<typeof sidechainParamsOf>[0];

export function trackSidechain(track: SidechainTrack): StudioFxSidechainParams | null {
  return sidechainParamsOf((track.effectsChain ?? null) as Chain);
}

/** A BEAT track that is not itself ducked feeds the key. */
export function isSidechainKey(track: SidechainTrack): boolean {
  return track.trackType === "BEAT" && !trackSidechain(track);
}

export function mixHasTrackSidechain(tracks: readonly SidechainTrack[]): boolean {
  return tracks.some((t) => trackSidechain(t) !== null);
}

export class SidechainBus {
  private readonly block: number;
  private readonly blockMs: number;
  private readonly peaks: Float32Array;

  constructor(sampleRate: number, length: number) {
    this.block = Math.max(1, Math.round(sampleRate * BLOCK_SEC));
    this.blockMs = (this.block / sampleRate) * 1000;
    this.peaks = new Float32Array(Math.ceil(length / this.block));
  }

  /** Add a rendered key track (after gain, FX and pan). */
  addKey(left: Float32Array, right: Float32Array): void {
    const n = Math.min(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const b = (i / this.block) | 0;
      const v = Math.abs(0.5 * (left[i]! + right[i]!));
      if (v > this.peaks[b]!) this.peaks[b] = v;
    }
  }

  /** Duck a rendered track in place. Gain glides between blocks (no zipper noise). */
  duck(left: Float32Array, right: Float32Array, params: StudioFxSidechainParams): void {
    const n = Math.min(left.length, right.length);
    let env = 0;
    let from = 1;
    for (let b = 0; b < this.peaks.length; b++) {
      const key = this.peaks[b]!;
      const follow = key > env ? params.attackMs : params.releaseMs;
      env += (key - env) * (1 - Math.exp(-this.blockMs / Math.max(1, follow)));
      const to = 1 - params.depth * Math.min(1, env * 2);
      const start = b * this.block;
      const end = Math.min(n, start + this.block);
      if (from !== 1 || to !== 1) {
        for (let i = start; i < end; i++) {
          const g = from + ((to - from) * (i - start)) / this.block;
          left[i]! *= g;
          right[i]! *= g;
        }
      }
      from = to;
    }
  }
}

/** Whole-mix form: key from the BEAT tracks, duck on every track with the effect (in place). */
export function applyTrackSidechain(
  tracks: readonly (SidechainTrack & { left: Float32Array; right: Float32Array })[],
  sampleRate: number,
): void {
  if (!mixHasTrackSidechain(tracks)) return;
  const bus = new SidechainBus(sampleRate, tracks[0]?.left.length ?? 0);
  for (const t of tracks) if (isSidechainKey(t)) bus.addKey(t.left, t.right);
  for (const t of tracks) {
    const params = trackSidechain(t);
    if (params) bus.duck(t.left, t.right, params);
  }
}

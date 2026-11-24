/** Slowed + reverb render (browser only: OfflineAudioContext). The file never leaves the device. */
import { fillStudioSyntheticImpulse, studioImpulseLengthFrames } from "@/lib/studio/studio-fx-impulse";

export type SlowedSettings = {
  /** Playback rate in percent of the original (pitch follows, like a tape). */
  speed: number;
  /** Reverb mix, percent. */
  reverb: number;
  /** Reverb tail, seconds. */
  tail: number;
};

export const SLOWED_LIMITS = { speedMin: 60, speedMax: 140, maxSeconds: 600, maxBytes: 80 * 1024 * 1024 } as const;

/** Length of the result in seconds (slowed audio plus the reverb tail). */
export function slowedSeconds(sourceSeconds: number, s: SlowedSettings): number {
  return sourceSeconds / (s.speed / 100) + (s.reverb > 0 ? s.tail : 0);
}

/** Semitones the pitch moves by when the speed changes. */
export function semitoneShift(speed: number): number {
  return Math.round(12 * Math.log2(speed / 100) * 10) / 10;
}

export async function renderSlowed(source: AudioBuffer, s: SlowedSettings): Promise<AudioBuffer> {
  const rate = source.sampleRate;
  const ctx = new OfflineAudioContext(2, Math.ceil(slowedSeconds(source.duration, s) * rate), rate);
  const node = ctx.createBufferSource();
  node.buffer = source;
  node.playbackRate.value = s.speed / 100;
  const dry = ctx.createGain();
  dry.gain.value = 1 - (s.reverb / 100) * 0.4;
  node.connect(dry).connect(ctx.destination);
  if (s.reverb > 0) {
    const impulse = ctx.createBuffer(2, studioImpulseLengthFrames(rate, s.tail), rate);
    fillStudioSyntheticImpulse(impulse.getChannelData(0), impulse.getChannelData(1), rate, s.tail);
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = (s.reverb / 100) * 0.9;
    node.connect(convolver).connect(wet).connect(ctx.destination);
  }
  node.start();
  return ctx.startRendering();
}

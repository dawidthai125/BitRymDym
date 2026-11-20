/**
 * Measures the admin's reference song in the browser: decode, mono 22 050 Hz, up to 3 minutes
 * from the body of the song (past the intro), then tempo and key. Nothing is uploaded; only the
 * numbers go on to the style description.
 */

import type { ReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";
import { estimateTempo } from "@/lib/beats/ai-beat/reference-tempo-dsp";
import { beatKeyDetectedLabel, detectBeatKeyFromMonoPcm } from "@/lib/beats/audio-key";

const RATE = 22_050;
const SECONDS = 180;
/** Files bigger than this are not decoded in the browser (memory). */
export const REFERENCE_FILE_MAX_BYTES = 80 * 1024 * 1024;
/** Below this margin over any non-octave rival the tempo is offered as candidates. */
export const TEMPO_SURE_MIN = 0.3;
/** Below this the key is left to the film description (test: Cm read as Gm at 0.46). */
export const KEY_SURE_MIN = 0.5;

/** Where the analysed part starts: past the intro (20% of the song, at most 30 s), and it fits. */
export function analysisWindow(durationSec: number, maxSec = SECONDS): { start: number; length: number } {
  if (!(durationSec > 0)) return { start: 0, length: 0 };
  const length = Math.min(maxSec, durationSec);
  const start = Math.max(0, Math.min(Math.min(30, durationSec * 0.2), durationSec - length));
  return { start, length };
}

export function measureFromPcm(mono: Float32Array, sampleRate: number): ReferenceMeasure | null {
  const tempo = estimateTempo(mono, sampleRate);
  if (!tempo) return null;
  const key = detectBeatKeyFromMonoPcm(mono, sampleRate);
  const clear = tempo.confidence >= TEMPO_SURE_MIN;
  return {
    bpm: tempo.bpm,
    // Half/double time left open: the film description (trap vs boom bap) picks between them.
    sure: clear && tempo.octaveAlternatives.length === 0,
    // A clear pulse offers only itself and its octave(s), so a stray Gemini guess cannot pick a random peak.
    candidates: clear ? [tempo.bpm, ...tempo.octaveAlternatives] : tempo.candidates,
    key: key && key.confidence >= KEY_SURE_MIN ? beatKeyDetectedLabel(key) : null,
  };
}

export async function measureReferenceFile(file: File): Promise<ReferenceMeasure | null> {
  if (file.size > REFERENCE_FILE_MAX_BYTES) throw new Error("too_big");
  const raw = await file.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(raw);
  } finally {
    void ctx.close();
  }
  const { start, length } = analysisWindow(decoded.duration);
  const frames = Math.floor(length * RATE);
  if (frames < RATE * 8) throw new Error("too_short");
  // One output channel: the browser downmixes stereo.
  const offline = new OfflineAudioContext(1, frames, RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0, start, length);
  const rendered = await offline.startRendering();
  return measureFromPcm(rendered.getChannelData(0), RATE);
}

/**
 * Offline render of a "Graj" session to a 16-bit stereo WAV (44.1 kHz).
 * Loop: exactly bars × 4 beats; the ring-out after the end is folded back onto the start,
 * so the loop repeats without a cut. One-shot: the sound with its natural tail.
 */

import {
  buildLiveEvents,
  createMaster,
  loadInstrument,
  startVoice,
  type LiveEvent,
} from "@/lib/studio/play/instrument-engine";
import { beatsToSeconds, type PlayInstrumentId, type PlaySession } from "@/lib/studio/play/play-types";
import { encodeWav16, normalizePeak, trimSilence } from "@/lib/studio/samples/sample-lab-dsp";
import { SAMPLE_MAX_MS, SAMPLE_MIN_MS } from "@/lib/studio/samples/sample-policy";

export const RENDER_RATE = 44_100;
const TAIL_SECONDS = 3;

/** The render schedule (pure): seconds from the loop start, swing applied, muted layers out. */
export function buildSchedule(session: PlaySession): LiveEvent[] {
  return buildLiveEvents(session);
}

export function loopSeconds(session: Pick<PlaySession, "bars" | "bpm">): number {
  return beatsToSeconds(session.bars * 4, session.bpm);
}

/** Catalog instrument id for a "Graj" instrument (sample-policy ids). */
export function sampleInstrumentFor(id: PlayInstrumentId): string {
  switch (id) {
    case "piano":
      return "piano";
    case "epiano":
      return "keys";
    case "guitar":
      return "acoustic_guitar";
    case "bass":
      return "live_bass";
    case "synth-lead":
      return "lead";
    case "synth-pad":
      return "pad";
    case "synth-bass":
      return "bass";
    default:
      return "drums";
  }
}

/** Kits are "effect" samples in the catalog, everything else "instrument". */
export function sampleKindFor(id: PlayInstrumentId): "instrument" | "effect" {
  return id === "drums" || id === "hiphop" ? "effect" : "instrument";
}

/** The layer with the most (unmuted) notes names the sample's instrument. */
export function mainInstrument(session: PlaySession): PlayInstrumentId | null {
  const layers = session.layers.filter((l) => !l.muted && l.notes.length);
  if (!layers.length) return null;
  return layers.reduce((a, b) => (b.notes.length > a.notes.length ? b : a)).instrument;
}

/** Add everything after `frames` back onto the start (seamless loop), then cut to `frames`. */
export function foldTail(channels: Float32Array[], frames: number): Float32Array[] {
  return channels.map((ch) => {
    const out = ch.slice(0, frames);
    for (let i = frames; i < ch.length; i++) out[(i - frames) % frames] += ch[i]!;
    return out;
  });
}

export type RenderMode = "loop" | "oneshot";

export async function renderSessionWav(session: PlaySession, mode: RenderMode): Promise<{ wav: Uint8Array; durationMs: number }> {
  const events = buildSchedule(session);
  if (!events.length) throw new Error("empty");
  const loopSec = loopSeconds(session);
  const lastEnd = events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
  const bodySec = mode === "loop" ? loopSec : Math.min(SAMPLE_MAX_MS / 1000, lastEnd);
  const total = Math.ceil((bodySec + TAIL_SECONDS) * RENDER_RATE);
  const ctx = new OfflineAudioContext(2, total, RENDER_RATE);
  const master = createMaster(ctx);
  const instruments = [...new Set(events.map((e) => e.instrument))];
  const assets = new Map(await Promise.all(instruments.map(async (id) => [id, await loadInstrument(id, ctx)] as const)));
  const lastSynth = new Map<string, number>();
  for (const e of events) {
    const a = assets.get(e.instrument);
    if (!a) continue;
    if (mode === "oneshot" && e.time >= bodySec) continue;
    const glideFrom = a.kind === "synth" ? lastSynth.get(e.instrument) ?? null : null;
    const v = startVoice({ ctx, dest: master, assets: a, note: e.note.n, velocity: e.note.v, when: e.time, synth: e.synth, gain: e.gain, glideFrom });
    if (a.kind === "synth") lastSynth.set(e.instrument, e.note.n);
    v.stop(e.time + e.dur);
  }
  const rendered = await ctx.startRendering();
  let channels: Float32Array<ArrayBuffer>[] = [rendered.getChannelData(0), rendered.getChannelData(1)].map((c) => new Float32Array(c) as Float32Array<ArrayBuffer>);
  if (mode === "loop") {
    channels = foldTail(channels, Math.round(loopSec * RENDER_RATE)) as Float32Array<ArrayBuffer>[];
  } else {
    const { end } = trimSilence(channels, RENDER_RATE, -60, 20);
    const minFrames = Math.ceil((SAMPLE_MIN_MS / 1000 + 0.02) * RENDER_RATE);
    const maxFrames = Math.floor((SAMPLE_MAX_MS / 1000) * RENDER_RATE);
    const len = Math.min(maxFrames, Math.max(minFrames, end));
    channels = channels.map((c) => {
      const out = new Float32Array(len);
      out.set(c.subarray(0, Math.min(len, c.length)));
      return out;
    });
  }
  normalizePeak(channels, -1);
  return { wav: encodeWav16(channels, RENDER_RATE), durationMs: Math.round((channels[0]!.length / RENDER_RATE) * 1000) };
}

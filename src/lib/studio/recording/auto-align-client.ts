/**
 * Browser side of the automatic latency: decode the finished take and the beat the page already holds,
 * line them up and ask auto-align. Runs while the take uploads; never blocks or changes the recording.
 */

import { ALIGN_MAX_SECONDS, ALIGN_RATE, bleedLag, recordsWithoutAutoAlign, toAlignRate, type BleedLag } from "@/lib/studio/recording/auto-align";

async function decodeMono(bytes: ArrayBuffer): Promise<Float32Array> {
  let buffer: AudioBuffer | null = null;
  // Decoding resamples to the context rate; some browsers refuse low rates.
  for (const rate of [ALIGN_RATE, 24_000, 48_000]) {
    try {
      buffer = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.slice(0));
      break;
    } catch {
      // next rate
    }
  }
  if (!buffer) throw new Error("decode");
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i += 1) mono[i]! += ch[i]! / buffer.numberOfChannels;
  }
  return toAlignRate(mono, buffer.sampleRate);
}

let lastBeat: { url: string; samples: Promise<Float32Array> } | null = null;

function beatSamples(url: string): Promise<Float32Array> {
  if (lastBeat?.url === url) return lastBeat.samples;
  const samples = fetch(url).then(async (r) => {
    if (!r.ok) throw new Error("beat");
    return decodeMono(await r.arrayBuffer());
  });
  samples.catch(() => {
    if (lastBeat?.url === url) lastBeat = null;
  });
  lastBeat = { url, samples };
  return samples;
}

export async function measureTakeLag(params: {
  take: Blob;
  /** Where the take's timeline start sits in the recording, before any correction. */
  recPositionMs: number;
  /** The same moment in the beat file. */
  beatPositionMs: number;
  maxMs: number;
  beatUrl: string;
}): Promise<BleedLag | null> {
  // Only a beat that is already on this device: the measurement must not cost a download.
  if (!params.beatUrl.startsWith("blob:")) return null;
  if (recordsWithoutAutoAlign(params.take.type)) return null;
  const [mic, beat] = await Promise.all([params.take.arrayBuffer().then(decodeMono), beatSamples(params.beatUrl)]);
  const length = Math.round((Math.min(params.maxMs / 1000, ALIGN_MAX_SECONDS) + 1) * ALIGN_RATE);
  const cut = (src: Float32Array, atMs: number) => {
    const at = Math.round((atMs * ALIGN_RATE) / 1000);
    const out = new Float32Array(Math.max(0, Math.min(length, src.length - at)));
    for (let i = 0; i < out.length; i += 1) out[i] = src[at + i] ?? 0;
    return out;
  };
  return bleedLag(cut(mic, params.recPositionMs), cut(beat, params.beatPositionMs), () => new Promise((r) => setTimeout(r, 0)));
}

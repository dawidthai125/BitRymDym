/**
 * Browser side of the BRD Tune live bake: fetch + decode the clip source, run
 * the tune in short slices between frames (works the same on phones, no
 * Worker bundling), return a WAV blob URL.
 */
import { encodeWavPcm16, renderTunedSourceSliced, type TuneBakeJob } from "./tune-bake";

export type TuneBakeRequest = {
  url: string;
  sampleRate: number;
  prefix: unknown[];
  tune: TuneBakeJob["tune"];
  originMs: number;
};

export async function bakeTunedClipInBrowser(req: TuneBakeRequest, signal: AbortSignal): Promise<string | null> {
  const Ctor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) return null;
  const res = await fetch(req.url, { signal });
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  if (signal.aborted) return null;
  const audio = await new Ctor(2, 1, req.sampleRate).decodeAudioData(bytes);
  const left = new Float32Array(audio.getChannelData(0));
  const right = new Float32Array(audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0));
  await renderTunedSourceSliced(
    { left, right, sampleRate: audio.sampleRate, prefix: req.prefix, tune: req.tune, originMs: req.originMs },
    { signal },
  );
  if (signal.aborted) return null;
  const wav = encodeWavPcm16(left, right, audio.sampleRate);
  return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
}

/** "Graj" instrument → the instrument and kind a saved sample can have (sample-policy SSOT). */
import { instrumentKind, isSampleInstrumentId, type SampleInstrumentId, type SampleKind } from "@/lib/studio/samples/sample-policy";
import type { PlayInstrumentId } from "@/lib/studio/play/play-types";

const MAP: Record<PlayInstrumentId, SampleInstrumentId> = {
  piano: "piano",
  epiano: "keys",
  guitar: "guitar",
  bass: "bass",
  hiphop: "drums",
  drums: "drums",
  "synth-lead": "lead",
  "synth-pad": "pad",
  "synth-bass": "bass",
};

export function sampleInstrumentForPlay(id: PlayInstrumentId): { instrument: SampleInstrumentId; kind: SampleKind } {
  const instrument = MAP[id];
  return { instrument, kind: instrumentKind(isSampleInstrumentId(instrument) ? instrument : "keys") };
}

/** Position inside the loop: playing over a second pass overdubs instead of falling out of the loop. */
export function loopBeat(absoluteBeat: number, loopBeats: number): number {
  if (!(loopBeats > 0)) return 0;
  return absoluteBeat <= 0 ? 0 : absoluteBeat % loopBeats;
}

/** Recorded note: start inside the loop, length cut at the loop end. */
export function recordedNote(startAbs: number, endAbs: number, loopBeats: number): { t: number; d: number } {
  const t = loopBeat(startAbs, loopBeats);
  return { t, d: Math.max(0.125, Math.min(endAbs - Math.max(0, startAbs), loopBeats - t)) };
}

import { bandShares } from "@/lib/beats/ai-beat/tonal-balance";
import { beatKeyDetectedLabel, detectBeatKeyFromMonoPcm } from "@/lib/beats/audio-key";

/** What was measured in the file itself. None of it names an instrument. */
export type ToneFacts = {
  lowSharePct: number;
  highSharePct: number;
  quietDb: number;
  loudDb: number;
  key: string | null;
  keyConfidence: number | null;
};

function pct(value: number): number {
  return Math.round(value * 100);
}

function db(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 10th and 90th percentile of 0.5 s RMS windows, in dB. */
export function dynamicSpread(samples: Float32Array, sampleRate: number): { quietDb: number; loudDb: number } {
  const win = Math.max(256, Math.round(sampleRate * 0.5));
  const levels: number[] = [];
  for (let start = 0; start + win <= samples.length; start += win) {
    let sum = 0;
    for (let i = start; i < start + win; i += 1) sum += (samples[i] as number) * (samples[i] as number);
    const rms = Math.sqrt(sum / win);
    levels.push(20 * Math.log10(Math.max(rms, 1e-6)));
  }
  if (levels.length === 0) return { quietDb: -120, loudDb: -120 };
  levels.sort((a, b) => a - b);
  const at = (p: number) => levels[Math.min(levels.length - 1, Math.floor(p * levels.length))] as number;
  return { quietDb: db(at(0.1)), loudDb: db(at(0.9)) };
}

export function measureToneFacts(samples: Float32Array, sampleRate: number): ToneFacts | null {
  if (!(sampleRate > 0) || samples.length < sampleRate) return null;
  const shares = bandShares(samples, sampleRate);
  const spread = dynamicSpread(samples, sampleRate);
  const key = detectBeatKeyFromMonoPcm(samples, sampleRate);
  return {
    lowSharePct: pct(shares.low),
    highSharePct: pct(shares.high),
    quietDb: spread.quietDb,
    loudDb: spread.loudDb,
    key: key ? beatKeyDetectedLabel(key) : null,
    keyConfidence: key ? key.confidence : null,
  };
}

/** Polish fact lines for Bitek. Measurements only. */
export function toneFactLines(tone: ToneFacts | null | undefined): string[] {
  if (!tone) return ["Pomiar pasm i tonacji: niedostępny."];
  const lines = [
    `Pomiar pasm: poniżej 150 Hz ${tone.lowSharePct}% energii, powyżej 2 kHz ${tone.highSharePct}% energii.`,
    `Dynamika: ciche fragmenty ${tone.quietDb} dB, głośne ${tone.loudDb} dB (rozpiętość ${db(tone.loudDb - tone.quietDb)} dB).`,
  ];
  lines.push(
    tone.key && tone.keyConfidence != null
      ? `Tonacja z analizy: ${tone.key} (pewność ${tone.keyConfidence}; poniżej 0.6 to słaba pewność).`
      : "Tonacja z analizy: niepewna.",
  );
  return lines;
}

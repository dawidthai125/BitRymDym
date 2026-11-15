export type PcmLevel = {
  peakDb: number;
  rmsDb: number;
  empty: boolean;
};

const SILENT_PEAK_DB = -50;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dbOf(amplitude: number): number {
  if (!(amplitude > 1e-8)) return -120;
  return round1(20 * Math.log10(Math.min(1, amplitude)));
}

/** Peak and average level of the whole file. This is not a list of instruments. */
export function measurePcmLevel(samples: Float32Array): PcmLevel {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    const abs = sample < 0 ? -sample : sample;
    if (abs > peak) peak = abs;
    sum += sample * sample;
  }
  const rms = samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
  const peakDb = dbOf(peak);
  const rmsDb = dbOf(rms);
  return {
    peakDb,
    rmsDb,
    empty: samples.length < 1000 || peakDb < SILENT_PEAK_DB,
  };
}

function finiteDb(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round1(value) : null;
}

/** Two fact lines: level in dB, and whether the file is practically silent. */
export function levelFactLines(peakDb: number | null | undefined, rmsDb: number | null | undefined): string[] {
  const peak = finiteDb(peakDb);
  const rms = finiteDb(rmsDb);
  if (peak == null || rms == null) {
    return ["Głośność: niezmierzona.", "Nagranie: nie sprawdzono, czy jest puste."];
  }
  const empty = peak < SILENT_PEAK_DB;
  return [
    `Głośność: szczyt ${peak} dB, średnio ${rms} dB.`,
    empty ? "Nagranie: praktycznie puste." : "Nagranie: jest dźwięk.",
  ];
}

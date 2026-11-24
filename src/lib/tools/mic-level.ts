/** Microphone level helpers (pure, client-safe). dBFS: 0 = clipping. */
export function levelOf(samples: Float32Array): { rmsDb: number; peakDb: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const db = (v: number) => (v > 0 ? Math.max(-100, 20 * Math.log10(v)) : -100);
  return { rmsDb: db(Math.sqrt(sum / Math.max(1, samples.length))), peakDb: db(peak) };
}

export type MicVerdict = "silence" | "quiet" | "good" | "hot";

/** Verdict from the loudest peak heard so far. */
export function micVerdict(peakDb: number): MicVerdict {
  if (peakDb < -50) return "silence";
  if (peakDb < -24) return "quiet";
  if (peakDb > -1) return "hot";
  return "good";
}

/** 0–100 for a meter drawn from −60 dBFS to 0. */
export function meterPercent(db: number): number {
  return Math.round(Math.min(100, Math.max(0, ((db + 60) / 60) * 100)));
}

/** The chosen microphone is gone (unplugged): the default one may still work. */
export function isMissingDeviceError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "OverconstrainedError" || name === "NotFoundError";
}

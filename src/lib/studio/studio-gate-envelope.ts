/**
 * Gate envelope + expander (shared offline / live worklet).
 * Self-contained class so `toString()` can ship inside an AudioWorklet module.
 */

export type GateEnvelopeParams = {
  thresholdDb: number;
  rangeDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
};

const EXPANDER_RATIO = 2;

export class GateEnvelopeCore {
  thresholdDb = -42;
  rangeDb = 8;
  attackMs = 2;
  holdMs = 40;
  releaseMs = 100;
  level = 0;
  holdLeft = 0;
  attackC = 1;
  releaseC = 1;
  holdSamples = 0;
  sampleRate = 48000;

  constructor(sampleRate: number, params?: Partial<GateEnvelopeParams>) {
    this.sampleRate = sampleRate > 0 ? sampleRate : 48000;
    this.setParams(params ?? {});
  }

  setParams(params: Partial<GateEnvelopeParams>): void {
    const n = (v: unknown, fallback: number, lo: number, hi: number) => {
      const x = typeof v === "number" && Number.isFinite(v) ? v : fallback;
      return Math.min(hi, Math.max(lo, x));
    };
    this.thresholdDb = n(params.thresholdDb, this.thresholdDb, -90, -20);
    this.rangeDb = n(params.rangeDb, this.rangeDb, 0, 40);
    this.attackMs = n(params.attackMs, this.attackMs, 0, 200);
    this.holdMs = n(params.holdMs, this.holdMs, 0, 500);
    this.releaseMs = n(params.releaseMs, this.releaseMs, 10, 1000);
    this.attackC = this.timeCoeff(this.attackMs);
    this.releaseC = this.timeCoeff(this.releaseMs);
    this.holdSamples = Math.max(0, Math.round((this.holdMs / 1000) * this.sampleRate));
  }

  reset(): void {
    this.level = 0;
    this.holdLeft = 0;
  }

  timeCoeff(ms: number): number {
    const sec = Math.max(0, ms) / 1000;
    if (sec <= 0 || !(this.sampleRate > 0)) return 1;
    return 1 - Math.exp(-1 / (this.sampleRate * sec));
  }

  step(peak: number): number {
    const x = Math.max(0, peak);
    if (x >= this.level) {
      this.level += (x - this.level) * this.attackC;
      this.holdLeft = this.holdSamples;
    } else if (this.holdLeft > 0) {
      this.holdLeft -= 1;
    } else {
      this.level += (x - this.level) * this.releaseC;
    }
    return this.level;
  }

  gainFor(envelope: number): number {
    const env = Math.abs(envelope);
    const envDb = env > 1e-9 ? 20 * Math.log10(env) : -180;
    if (envDb >= this.thresholdDb) return 1;
    const cut = Math.min(
      Math.max(0, this.rangeDb),
      (this.thresholdDb - envDb) * (EXPANDER_RATIO - 1),
    );
    return 10 ** (-cut / 20);
  }

  processBlock(
    lIn: Float32Array,
    rIn: Float32Array,
    lOut: Float32Array,
    rOut: Float32Array,
    frames: number,
  ): void {
    const n = Math.max(0, frames | 0);
    for (let i = 0; i < n; i++) {
      const l = lIn[i] || 0;
      const r = rIn[i] || 0;
      const g = this.gainFor(this.step(Math.max(Math.abs(l), Math.abs(r))));
      lOut[i] = l * g;
      rOut[i] = r * g;
    }
  }
}

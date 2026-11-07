/**
 * Vocal rider. Evens words inside a phrase.
 * A slow envelope is the target. A fast envelope is the word.
 * Quiet words rise, loud words sit down, both capped.
 * Below the noise floor the gain returns to 1, so the room does not come up.
 * Amount 0 is a wire. This is not a LUFS preset and not the verse/hook pocket.
 */

export type VocalLevelParams = {
  amount: number;
  maxBoostDb: number;
  maxCutDb: number;
};

export class VocalLevelCore {
  amount = 0.65;
  maxBoostDb = 6;
  maxCutDb = 6;
  fast = 0;
  slow = 0;
  gain = 1;
  floor = 0;
  fastAtt = 0;
  fastRel = 0;
  slowA = 0;
  gainA = 0;
  boost = 1;
  cut = 1;

  constructor(sampleRate: number, params?: Partial<VocalLevelParams>) {
    const sr = sampleRate > 0 ? sampleRate : 48000;
    this.floor = Math.pow(10, -50 / 20);
    this.fastAtt = 1 - Math.exp(-1 / (sr * 0.008));
    this.fastRel = 1 - Math.exp(-1 / (sr * 0.12));
    this.slowA = 1 - Math.exp(-1 / (sr * 0.4));
    this.gainA = 1 - Math.exp(-1 / (sr * 0.04));
    this.setParams(params ?? {});
  }

  setParams(params: Partial<VocalLevelParams>): void {
    const n = (v: unknown, fallback: number, lo: number, hi: number) => {
      const x = typeof v === "number" && Number.isFinite(v) ? v : fallback;
      return Math.min(hi, Math.max(lo, x));
    };
    this.amount = n(params.amount, 0.65, 0, 1);
    this.maxBoostDb = n(params.maxBoostDb, 6, 0, 12);
    this.maxCutDb = n(params.maxCutDb, 6, 0, 12);
    this.boost = Math.pow(10, this.maxBoostDb / 20);
    this.cut = Math.pow(10, -this.maxCutDb / 20);
  }

  processBlock(lIn: Float32Array, rIn: Float32Array, lOut: Float32Array, rOut: Float32Array, frames: number): void {
    const n = Math.max(0, frames | 0);
    for (let i = 0; i < n; i++) {
      const l = lIn[i] || 0;
      const r = rIn[i] || 0;
      const level = Math.max(Math.abs(l), Math.abs(r));
      const c = level > this.fast ? this.fastAtt : this.fastRel;
      this.fast += (level - this.fast) * c;
      let target = 1;
      if (this.fast >= this.floor) {
        if (this.slow < this.floor) this.slow = this.fast;
        else this.slow += (this.fast - this.slow) * this.slowA;
        let ratio = this.slow / Math.max(this.fast, 1e-8);
        if (ratio > this.boost) ratio = this.boost;
        if (ratio < this.cut) ratio = this.cut;
        target = 1 + this.amount * (ratio - 1);
      }
      this.gain += (target - this.gain) * this.gainA;
      lOut[i] = l * this.gain;
      rOut[i] = r * this.gain;
    }
  }
}

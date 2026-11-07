/**
 * One voice, three colours: lower, higher, or a phone band.
 * mix 0 is a wire. This is the same singer, not a second person and not a choir.
 */

export type VoiceShiftParams = { color: number; mix: number };

type Tap = {
  ratio: number;
  bufL: Float32Array;
  bufR: Float32Array;
  w: number;
  phase: number;
  lpL: number;
  lpR: number;
  hpL: number;
  hpR: number;
};

export class VoiceShiftCore {
  color = 0;
  mix = 1;
  sr = 48000;
  tap: Tap;

  constructor(sampleRate: number, params?: Partial<VoiceShiftParams>) {
    const sr = sampleRate > 0 ? sampleRate : 48000;
    this.sr = sr;
    const win = Math.max(64, Math.round(sr * 0.04));
    this.tap = {
      ratio: 1,
      bufL: new Float32Array(win),
      bufR: new Float32Array(win),
      w: 0,
      phase: 0,
      lpL: 0,
      lpR: 0,
      hpL: 0,
      hpR: 0,
    };
    this.setParams(params ?? {});
  }

  setParams(params: Partial<VoiceShiftParams>): void {
    const color = typeof params.color === "number" && Number.isFinite(params.color) ? params.color : 0;
    const mix = typeof params.mix === "number" && Number.isFinite(params.mix) ? params.mix : 1;
    this.color = Math.min(2, Math.max(0, Math.round(color)));
    this.mix = Math.min(1, Math.max(0, mix));
    const ratio = this.color === 0 ? Math.pow(2, -5 / 12) : this.color === 1 ? Math.pow(2, 4 / 12) : 1;
    this.tap.ratio = ratio;
  }

  reset(): void {
    const t = this.tap;
    t.bufL.fill(0);
    t.bufR.fill(0);
    t.w = 0;
    t.phase = 0;
    t.lpL = 0;
    t.lpR = 0;
    t.hpL = 0;
    t.hpR = 0;
  }

  processBlock(lIn: Float32Array, rIn: Float32Array, lOut: Float32Array, rOut: Float32Array, frames: number): void {
    const n = Math.max(0, frames | 0);
    const same = lIn === lOut || rIn === rOut;
    const l = same ? lIn.slice(0, n) : lIn;
    const r = same ? rIn.slice(0, n) : rIn;
    for (let i = 0; i < n; i++) {
      const dryL = l[i] || 0;
      const dryR = r[i] || 0;
      if (this.mix <= 0) {
        lOut[i] = dryL;
        rOut[i] = dryR;
        continue;
      }
      let wet = this.step(dryL, dryR);
      let wetL = wet.l;
      let wetR = wet.r;
      if (this.color === 2) {
        wetL = this.phone(wetL, true);
        wetR = this.phone(wetR, false);
      }
      const m = this.mix;
      lOut[i] = dryL * (1 - m) + wetL * m;
      rOut[i] = dryR * (1 - m) + wetR * m;
    }
  }

  phone(x: number, left: boolean): number {
    const t = this.tap;
    const hpA = 1 - Math.exp((-2 * Math.PI * 300) / this.sr);
    const lpA = 1 - Math.exp((-2 * Math.PI * 3000) / this.sr);
    if (left) {
      t.hpL += (x - t.hpL) * hpA;
      const high = x - t.hpL;
      t.lpL += (high - t.lpL) * lpA;
      return t.lpL;
    }
    t.hpR += (x - t.hpR) * hpA;
    const high = x - t.hpR;
    t.lpR += (high - t.lpR) * lpA;
    return t.lpR;
  }

  step(xL: number, xR: number): { l: number; r: number } {
    const t = this.tap;
    const W = t.bufL.length;
    let w = t.w;
    let phase = t.phase;
    t.bufL[w] = xL;
    t.bufR[w] = xR;
    const d1 = phase * W;
    let phase2 = phase + 0.5;
    if (phase2 >= 1) phase2 -= 1;
    const d2 = phase2 * W;
    const w1 = Math.sin(Math.PI * phase) ** 2;
    const w2 = 1 - w1;
    const l = this.read(t.bufL, w, d1) * w1 + this.read(t.bufL, w, d2) * w2;
    const r = this.read(t.bufR, w, d1) * w1 + this.read(t.bufR, w, d2) * w2;
    w += 1;
    if (w >= W) w = 0;
    phase += (1 - t.ratio) / W;
    if (phase >= 1) phase -= 1;
    else if (phase < 0) phase += 1;
    t.w = w;
    t.phase = phase;
    return { l, r };
  }

  read(buf: Float32Array, w: number, delay: number): number {
    const W = buf.length;
    let pos = w - delay;
    if (pos < 0) pos += W;
    let i0 = pos | 0;
    if (i0 >= W) i0 = 0;
    const frac = pos - Math.floor(pos);
    const i1 = i0 + 1 >= W ? 0 : i0 + 1;
    return (buf[i0] || 0) * (1 - frac) + (buf[i1] || 0) * frac;
  }
}

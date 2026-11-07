/**
 * Two quiet harmony voices on a lead: a fifth down and a minor third up.
 * Each voice is a dual-tap delay pitch shifter, then a short musical delay.
 * The dry vocal stays put. Amount 0 is a wire. This is not a choir.
 */

export type VocalHarmonyParams = { amount: number };

type Voice = {
  ratio: number;
  hold: number;
  bufL: Float32Array;
  bufR: Float32Array;
  w: number;
  phase: number;
  dL: Float32Array;
  dR: Float32Array;
  dw: number;
};

export class VocalHarmonyCore {
  amount = 0.7;
  sr = 48000;
  floor = 0.003;
  voices: Voice[] = [];

  constructor(sampleRate: number, params?: Partial<VocalHarmonyParams>) {
    const sr = sampleRate > 0 ? sampleRate : 48000;
    this.sr = sr;
    this.floor = Math.pow(10, -50 / 20);
    const win = Math.max(64, Math.round(sr * 0.04));
    this.voices = [
      this.makeVoice(win, Math.pow(2, -7 / 12), Math.round(sr * 0.028)),
      this.makeVoice(win, Math.pow(2, 3 / 12), Math.round(sr * 0.022)),
    ];
    this.setParams(params ?? {});
  }

  makeVoice(win: number, ratio: number, hold: number): Voice {
    const h = Math.max(1, hold);
    return {
      ratio,
      hold: h,
      bufL: new Float32Array(win),
      bufR: new Float32Array(win),
      w: 0,
      phase: 0,
      dL: new Float32Array(h + 1),
      dR: new Float32Array(h + 1),
      dw: 0,
    };
  }

  setParams(params: Partial<VocalHarmonyParams>): void {
    const x = typeof params.amount === "number" && Number.isFinite(params.amount) ? params.amount : 0.7;
    this.amount = Math.min(1, Math.max(0, x));
  }

  reset(): void {
    for (const v of this.voices) {
      v.bufL.fill(0);
      v.bufR.fill(0);
      v.dL.fill(0);
      v.dR.fill(0);
      v.w = 0;
      v.phase = 0;
      v.dw = 0;
    }
  }

  processBlock(lIn: Float32Array, rIn: Float32Array, lOut: Float32Array, rOut: Float32Array, frames: number): void {
    const n = Math.max(0, frames | 0);
    const same = lIn === lOut || rIn === rOut;
    const l = same ? lIn.slice(0, n) : lIn;
    const r = same ? rIn.slice(0, n) : rIn;
    for (let i = 0; i < n; i++) {
      lOut[i] = l[i] || 0;
      rOut[i] = r[i] || 0;
    }
    if (this.amount <= 0 || n === 0) return;
    const down = this.amount * Math.pow(10, -16 / 20);
    const up = this.amount * Math.pow(10, -18 / 20);
    const fifth = this.voices[0]!;
    const third = this.voices[1]!;
    for (let i = 0; i < n; i++) {
      const ls = l[i] || 0;
      const rs = r[i] || 0;
      const a = this.voice(fifth, ls, rs);
      const b = this.voice(third, ls, rs);
      lOut[i] = (lOut[i] || 0) + a.l * down + b.l * up;
      rOut[i] = (rOut[i] || 0) + a.r * down + b.r * up;
    }
  }

  voice(v: Voice, ls: number, rs: number): { l: number; r: number } {
    const bufL = v.bufL;
    const bufR = v.bufR;
    const W = bufL.length;
    let w = v.w;
    let phase = v.phase;
    const quiet = Math.max(Math.abs(ls), Math.abs(rs)) < this.floor;
    bufL[w] = quiet ? 0 : ls;
    bufR[w] = quiet ? 0 : rs;
    const d1 = phase * W;
    let phase2 = phase + 0.5;
    if (phase2 >= 1) phase2 -= 1;
    const d2 = phase2 * W;
    const w1 = Math.sin(Math.PI * phase) ** 2;
    const w2 = 1 - w1;
    const pL = this.tap(bufL, w, d1) * w1 + this.tap(bufL, w, d2) * w2;
    const pR = this.tap(bufR, w, d1) * w1 + this.tap(bufR, w, d2) * w2;
    w += 1;
    if (w >= W) w = 0;
    phase += (1 - v.ratio) / W;
    if (phase >= 1) phase -= 1;
    else if (phase < 0) phase += 1;
    v.w = w;
    v.phase = phase;

    const dL = v.dL;
    const dR = v.dR;
    const H = dL.length;
    let dw = v.dw;
    dL[dw] = pL;
    dR[dw] = pR;
    let rp = dw - v.hold;
    if (rp < 0) rp += H;
    const outL = dL[rp] || 0;
    const outR = dR[rp] || 0;
    dw += 1;
    if (dw >= H) dw = 0;
    v.dw = dw;
    return { l: outL, r: outR };
  }

  tap(buf: Float32Array, w: number, delay: number): number {
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

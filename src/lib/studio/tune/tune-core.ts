/**
 * BRD Tune — streaming vocal pitch correction (gaps P0 #1).
 *
 * ONE implementation for both paths:
 *  - browser preview: the class source is shipped into an AudioWorklet
 *    (`studio-tune-worklet.ts`, `TuneCore.toString()`), fed 128-frame blocks;
 *  - E3 / offline render: `studio-offline-fx.ts` runs the same class over
 *    whole buffers (latency compensated).
 * Output is chunk-size invariant (all state advances per sample), so both
 * paths produce the same samples (offline = live shifted by `latency`).
 *
 * Algorithm (own code, no third-party DSP — no GPL concerns):
 *  - pitch: YIN (cumulative mean normalised difference + parabolic
 *    interpolation) on a ~11 kHz box-decimated mono mix, every 512 samples;
 *  - target: nearest note of the key/scale (with hysteresis), correction
 *    scaled by `amount` and smoothed with a one-pole `retuneMs` (0 = hard);
 *  - shift: TD-PSOLA — Hann grains of 2 periods taken at pitch-synchronous
 *    analysis marks, re-spaced at period/ratio, normalised overlap-add.
 *    PSOLA keeps the spectral envelope → formants are preserved.
 *
 * MUST stay self-contained: no imports, no module-level references, no class
 * fields (the source is evaluated inside AudioWorkletGlobalScope).
 */

export type TuneCoreParams = {
  /** 0..11 (C..B). */
  keyRoot: number;
  /** 0 = major, 1 = minor, 2 = chromatic. */
  scale: number;
  /** Retune speed: 0 = instant ("trap"), larger = more natural. */
  retuneMs: number;
  /** 0..1 — fraction of the pitch error that gets corrected. */
  amount: number;
};

export class TuneCore {
  declare sampleRate: number;
  declare channels: number;
  declare latency: number;
  declare maxPeriod: number;
  declare defaultPeriod: number;
  declare size: number;
  declare mask: number;
  declare inBuf: Float32Array[];
  declare accBuf: Float32Array[];
  declare wBuf: Float32Array;
  declare decim: number;
  declare decAcc: number;
  declare decCount: number;
  declare dSize: number;
  declare dBuf: Float32Array;
  declare dPos: number;
  declare dFilled: number;
  declare tauMin: number;
  declare tauMax: number;
  declare yinW: number;
  declare yinD: Float32Array;
  declare hop: number;
  declare n: number;
  declare period: number;
  declare voiced: boolean;
  declare corr: number;
  declare target: number;
  declare ratio: number;
  declare nextSyn: number;
  declare anaMark: number;
  declare hann: Float32Array;
  declare outL: number;
  declare outR: number;
  declare keyRoot: number;
  declare scale: number;
  declare retuneMs: number;
  declare amount: number;
  declare scaleMask: number[];

  constructor(sampleRate: number, channels: number, params: TuneCoreParams) {
    const sr = sampleRate > 0 ? sampleRate : 44100;
    this.sampleRate = sr;
    this.channels = channels === 1 ? 1 : 2;
    // Fixed 40 ms latency (integer samples at 44.1/48 kHz).
    this.latency = Math.round(sr * 0.04);
    this.maxPeriod = Math.ceil(sr / 75);
    this.defaultPeriod = Math.round(sr * 0.006);
    let size = 1;
    while (size < (this.latency + 4 * this.maxPeriod) * 2) size *= 2;
    this.size = size;
    this.mask = size - 1;
    this.inBuf = [];
    this.accBuf = [];
    for (let c = 0; c < this.channels; c += 1) {
      this.inBuf.push(new Float32Array(size));
      this.accBuf.push(new Float32Array(size));
    }
    this.wBuf = new Float32Array(size);
    this.decim = Math.max(1, Math.round(sr / 11025));
    const dsr = sr / this.decim;
    this.decAcc = 0;
    this.decCount = 0;
    this.tauMin = Math.max(2, Math.floor(dsr / 1000));
    this.tauMax = Math.ceil(dsr / 75);
    this.yinW = this.tauMax;
    let dSize = 1;
    while (dSize < (this.yinW + this.tauMax + 2) * 2) dSize *= 2;
    this.dSize = dSize;
    this.dBuf = new Float32Array(dSize);
    this.dPos = 0;
    this.dFilled = 0;
    this.yinD = new Float32Array(this.tauMax + 2);
    this.hop = 512;
    this.n = 0;
    this.period = this.defaultPeriod;
    this.voiced = false;
    this.corr = 0;
    this.target = -1;
    this.ratio = 1;
    // Marks start at t=0; grain parts before t=0 are skipped (see grain()).
    this.nextSyn = 0;
    this.anaMark = 0;
    this.hann = new Float32Array(4097);
    for (let i = 0; i <= 4096; i += 1) {
      this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 4096);
    }
    this.outL = 0;
    this.outR = 0;
    this.keyRoot = 0;
    this.scale = 2;
    this.retuneMs = 0;
    this.amount = 1;
    this.scaleMask = [];
    this.setParams(params);
  }

  setParams(params: TuneCoreParams): void {
    const root = Math.round(Number(params.keyRoot));
    this.keyRoot = root >= 0 && root <= 11 ? root : 0;
    const sc = Math.round(Number(params.scale));
    this.scale = sc === 0 || sc === 1 ? sc : 2;
    const rt = Number(params.retuneMs);
    this.retuneMs = rt > 0 && rt <= 1000 ? rt : 0;
    const am = Number(params.amount);
    this.amount = am >= 0 && am <= 1 ? am : 1;
    const major = [0, 2, 4, 5, 7, 9, 11];
    const minor = [0, 2, 3, 5, 7, 8, 10];
    const mask: number[] = [];
    for (let pc = 0; pc < 12; pc += 1) mask.push(this.scale === 2 ? 1 : 0);
    if (this.scale !== 2) {
      const steps = this.scale === 0 ? major : minor;
      for (let i = 0; i < steps.length; i += 1) mask[(this.keyRoot + steps[i]!) % 12] = 1;
    }
    this.scaleMask = mask;
  }

  /** Nearest allowed MIDI note (scale) to a fractional MIDI pitch. */
  snap(midi: number): number {
    const base = Math.round(midi);
    let best = base;
    let bestDist = 1e9;
    for (let k = -2; k <= 2; k += 1) {
      const note = base + k;
      const pc = ((note % 12) + 12) % 12;
      if (this.scaleMask[pc] !== 1) continue;
      const d = Math.abs(note - midi);
      if (d < bestDist) {
        bestDist = d;
        best = note;
      }
    }
    // Hysteresis: keep the current note unless the new one is clearly closer.
    const prev = this.target;
    if (prev >= 0 && prev !== best) {
      const ppc = ((prev % 12) + 12) % 12;
      if (this.scaleMask[ppc] === 1 && Math.abs(prev - midi) < bestDist + 0.2 && Math.abs(prev - midi) < 1) {
        return prev;
      }
    }
    return best;
  }

  /** YIN on the decimated mono history → sets period / voiced / ratio. */
  detect(): void {
    const W = this.yinW;
    const tauMax = this.tauMax;
    const need = W + tauMax;
    let voiced = false;
    let periodFull = this.defaultPeriod;
    if (this.dFilled >= need) {
      const dmask = this.dSize - 1;
      const start = (this.dPos - need + this.dSize) & dmask;
      const d = this.dBuf;
      let energy = 0;
      for (let j = 0; j < W; j += 1) {
        const v = d[(start + j) & dmask]!;
        energy += v * v;
      }
      // Gate ≈ −55 dBFS RMS: silence / breaths are left untouched.
      if (energy / W > 3.2e-6) {
        const yd = this.yinD;
        yd[0] = 1;
        let running = 0;
        for (let tau = 1; tau <= tauMax; tau += 1) {
          let sum = 0;
          for (let j = 0; j < W; j += 1) {
            const diff = d[(start + j) & dmask]! - d[(start + j + tau) & dmask]!;
            sum += diff * diff;
          }
          running += sum;
          yd[tau] = running > 0 ? (sum * tau) / running : 1;
        }
        let found = -1;
        for (let tau = this.tauMin; tau < tauMax; tau += 1) {
          if (yd[tau]! < 0.15) {
            while (tau + 1 < tauMax && yd[tau + 1]! < yd[tau]!) tau += 1;
            found = tau;
            break;
          }
        }
        if (found > 0) {
          const p = this.refine(found * this.decim);
          if (p >= 16 && p <= this.maxPeriod) {
            voiced = true;
            periodFull = p;
          }
        }
      }
    }
    let goal = 0;
    if (voiced) {
      const midi = 69 + 12 * Math.log2(this.sampleRate / periodFull / 440);
      const note = this.snap(midi);
      this.target = note;
      let err = note - midi;
      if (err > 2) err = 2;
      if (err < -2) err = -2;
      goal = err * this.amount;
    } else {
      this.target = -1;
    }
    const alpha =
      this.retuneMs > 0
        ? 1 - Math.exp(-this.hop / ((this.retuneMs / 1000) * this.sampleRate))
        : 1;
    this.corr += (goal - this.corr) * alpha;
    if (!voiced && Math.abs(this.corr) < 1e-4) this.corr = 0;
    this.voiced = voiced;
    this.period = periodFull;
    this.ratio = Math.pow(2, this.corr / 12);
  }

  /** Full-rate refinement: raw squared difference around the coarse lag + parabola. */
  refine(coarse: number): number {
    const mask = this.mask;
    const D = this.decim;
    const W = this.yinW * D;
    const end = this.n;
    const a = this.inBuf[0]!;
    const b = this.channels === 2 ? this.inBuf[1]! : a;
    const lo = Math.max(2, coarse - D - 1);
    const hi = Math.min(this.maxPeriod + 1, coarse + D + 1);
    let bestLag = coarse;
    let best = Infinity;
    let prev = Infinity;
    let bestPrev = Infinity;
    let bestNext = Infinity;
    for (let lag = lo; lag <= hi; lag += 1) {
      let sum = 0;
      const s0 = end - W - lag + 1;
      for (let j = 0; j < W; j += 2) {
        const i0 = (s0 + j) & mask;
        const i1 = (s0 + j + lag) & mask;
        const diff = a[i0]! + b[i0]! - a[i1]! - b[i1]!;
        sum += diff * diff;
      }
      if (sum < best) {
        best = sum;
        bestLag = lag;
        bestPrev = prev;
        bestNext = Infinity;
      } else if (lag === bestLag + 1) {
        bestNext = sum;
      }
      prev = sum;
    }
    if (bestLag <= lo || bestLag >= hi || !isFinite(bestPrev) || !isFinite(bestNext)) return bestLag;
    const den = bestPrev - 2 * best + bestNext;
    let frac = den > 0 ? (0.5 * (bestPrev - bestNext)) / den : 0;
    if (frac > 0.5) frac = 0.5;
    if (frac < -0.5) frac = -0.5;
    return bestLag + frac;
  }

  /** Overlap-add one Hann grain (half-length P) from analysis ta to synthesis ts. */
  grain(ta: number, ts: number, P: number): void {
    const mask = this.mask;
    const len = 2 * P;
    const step = 4096 / len;
    // Never touch ring slots of negative time (they alias future samples).
    const k0 = Math.max(0, P - ts);
    for (let c = 0; c < this.channels; c += 1) {
      const src = this.inBuf[c]!;
      const acc = this.accBuf[c]!;
      for (let k = k0; k < len; k += 1) {
        const w = this.hann[Math.floor(k * step)]!;
        acc[(ts - P + k) & mask] += w * src[(ta - P + k) & mask]!;
      }
    }
    const wb = this.wBuf;
    for (let k = k0; k < len; k += 1) {
      wb[(ts - P + k) & mask] += this.hann[Math.floor(k * step)]!;
    }
  }

  /** Push one stereo (or mono: r ignored) sample; result in outL/outR (delayed by `latency`). */
  step(l: number, r: number): void {
    const n = this.n;
    const mask = this.mask;
    const idx = n & mask;
    this.inBuf[0]![idx] = l;
    if (this.channels === 2) this.inBuf[1]![idx] = r;
    const mono = this.channels === 2 ? 0.5 * (l + r) : l;
    this.decAcc += mono;
    this.decCount += 1;
    if (this.decCount === this.decim) {
      this.dBuf[this.dPos] = this.decAcc / this.decim;
      this.dPos = (this.dPos + 1) & (this.dSize - 1);
      if (this.dFilled < this.dSize) this.dFilled += 1;
      this.decAcc = 0;
      this.decCount = 0;
    }
    if ((n + 1) % this.hop === 0) this.detect();

    // Place synthesis grains whose input is fully available.
    const reach = 1.5 * this.maxPeriod + 2;
    while (this.nextSyn + reach <= n) {
      const ts = Math.round(this.nextSyn);
      const Pa = this.voiced ? this.period : this.defaultPeriod;
      if (this.ratio === 1) {
        // No correction → analysis = synthesis (bit-transparent OLA, no phase jump).
        this.anaMark = this.nextSyn;
      } else {
        while (this.anaMark + Pa * 0.5 <= ts) this.anaMark += Pa;
      }
      const ta = Math.round(this.anaMark);
      const P = Math.max(8, Math.round(Pa));
      this.grain(ta, ts, P);
      this.nextSyn += Pa / this.ratio;
    }

    const t = n - this.latency;
    if (t >= 0) {
      const ti = t & mask;
      let w = this.wBuf[ti]!;
      if (w < 0.5) w = 0.5;
      this.outL = this.accBuf[0]![ti]! / w;
      this.accBuf[0]![ti] = 0;
      if (this.channels === 2) {
        this.outR = this.accBuf[1]![ti]! / w;
        this.accBuf[1]![ti] = 0;
      } else {
        this.outR = this.outL;
      }
      this.wBuf[ti] = 0;
    } else {
      this.outL = 0;
      this.outR = 0;
    }
    this.n = n + 1;
  }

  /** Block API (AudioWorklet): out may alias inp only in the offline caller. */
  processBlock(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, frames: number): void {
    for (let i = 0; i < frames; i += 1) {
      this.step(inL[i]!, inR[i]!);
      outL[i] = this.outL;
      outR[i] = this.outR;
    }
  }
}

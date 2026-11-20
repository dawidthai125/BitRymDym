/**
 * Stable Audio drifts dark and bass-heavy. This reads a generated 16-bit PCM WAV,
 * measures how much of its energy sits below 150 Hz and above 2 kHz, and nudges
 * both toward a normal hip-hop balance with a low shelf and a high shelf.
 * Pure TypeScript (no ffmpeg on the server). Anything it cannot read is left alone.
 */

export type ToneReport = {
  applied: boolean;
  reason?: string;
  lowShareBefore?: number;
  highShareBefore?: number;
  lowCutDb?: number;
  highBoostDb?: number;
  gainDb?: number;
};

/** Share of energy below 150 Hz above which the low end is trimmed. */
export const LOW_SHARE_TARGET = 0.5;
/**
 * Share of energy above 2 kHz below which the top end is lifted. 0.10 is where the best-rated
 * test beat sat (2026-11-20: 10% vs 6–7% for the darker versions Gemini marked 5/10 on mix).
 */
export const HIGH_SHARE_TARGET = 0.1;
export const MAX_LOW_CUT_DB = 7;
export const MAX_HIGH_BOOST_DB = 9;
/** About -1.5 dBFS: MP3/AAC encoding adds inter-sample peaks (seen +0.8 dBTP at a -1 dBFS ceiling). */
export const PEAK_CEILING = 0.84;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

function norm(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function lowPass(fs: number, f0: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  return norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

export function highPass(fs: number, f0: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  return norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

export function lowShelf(fs: number, f0: number, gainDb: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w);
  const s = Math.sin(w);
  const alpha = (s / 2) * Math.SQRT2; // shelf slope 1
  const sq = 2 * Math.sqrt(A) * alpha;
  return norm(
    A * (A + 1 - (A - 1) * c + sq),
    2 * A * (A - 1 - (A + 1) * c),
    A * (A + 1 - (A - 1) * c - sq),
    A + 1 + (A - 1) * c + sq,
    -2 * (A - 1 + (A + 1) * c),
    A + 1 + (A - 1) * c - sq,
  );
}

export function highShelf(fs: number, f0: number, gainDb: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w);
  const s = Math.sin(w);
  const alpha = (s / 2) * Math.SQRT2;
  const sq = 2 * Math.sqrt(A) * alpha;
  return norm(
    A * (A + 1 + (A - 1) * c + sq),
    -2 * A * (A - 1 + (A + 1) * c),
    A * (A + 1 + (A - 1) * c - sq),
    A + 1 - (A - 1) * c + sq,
    2 * (A - 1 - (A + 1) * c),
    A + 1 - (A - 1) * c - sq,
  );
}

function run(filters: Biquad[], input: Float32Array): Float32Array {
  const out = new Float32Array(input);
  for (const f of filters) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < out.length; i += 1) {
      const x0 = out[i] as number;
      const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      out[i] = y0;
    }
  }
  return out;
}

function energy(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] as number) * (a[i] as number);
  return s;
}

/** Energy shares below 150 Hz and above 2 kHz (4th-order split, mono sum). */
export function bandShares(mono: Float32Array, fs: number): { low: number; high: number } {
  const total = energy(mono);
  if (!(total > 1e-9)) return { low: 0, high: 0 };
  const low = energy(run([lowPass(fs, 150), lowPass(fs, 150)], mono));
  const high = energy(run([highPass(fs, 2000), highPass(fs, 2000)], mono));
  return { low: low / total, high: high / total };
}

export function planCorrection(low: number, high: number): { lowCutDb: number; highBoostDb: number } {
  const lowCutDb =
    low > LOW_SHARE_TARGET
      ? Math.min(MAX_LOW_CUT_DB, Math.max(0, 10 * Math.log10(low / LOW_SHARE_TARGET) * 2.5))
      : 0;
  const highBoostDb =
    high > 0 && high < HIGH_SHARE_TARGET
      ? Math.min(MAX_HIGH_BOOST_DB, Math.max(0, 10 * Math.log10(HIGH_SHARE_TARGET / high) * 1.5))
      : 0;
  return { lowCutDb, highBoostDb };
}


/**
 * Lookahead peak limiter: only the transients that exceed the ceiling are pulled down,
 * so the filtered file keeps its loudness instead of being turned down as a whole.
 */
export function limitPeaks(chans: Float32Array[], ceiling: number, fs: number): { gainMinDb: number } {
  const n = chans[0]?.length ?? 0;
  const look = Math.max(8, Math.round(fs * 0.0015));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let m = 0;
    for (const ch of chans) {
      const v = Math.abs(ch[i] as number);
      if (v > m) m = v;
    }
    need[i] = m > ceiling ? ceiling / m : 1;
  }
  // Sliding minimum over [i - look, i + look] so the gain is down before the peak arrives.
  const mins = new Float32Array(n);
  const dq: number[] = [];
  let head = 0;
  for (let i = 0, j = 0; i < n; i += 1) {
    const hi = Math.min(n - 1, i + look);
    while (j <= hi) {
      while (dq.length > head && (need[dq[dq.length - 1] as number] as number) >= (need[j] as number)) dq.pop();
      dq.push(j);
      j += 1;
    }
    while ((dq[head] as number) < i - look) head += 1;
    mins[i] = need[dq[head] as number] as number;
  }
  // Smooth the attack with a centered moving average. The gain never rises above the minimum.
  const win = look;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = (prefix[i] as number) + (mins[i] as number);
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - Math.floor(win / 2));
    const hi = Math.min(n, i + Math.ceil(win / 2));
    smooth[i] = Math.min(mins[i] as number, ((prefix[hi] as number) - (prefix[lo] as number)) / (hi - lo));
  }
  const rel = 1 - Math.exp(-1 / (fs * 0.06));
  let g = 1;
  let gainMin = 1;
  for (let i = 0; i < n; i += 1) {
    const t = smooth[i] as number;
    g = t < g ? t : g + (t - g) * rel;
    if (g < gainMin) gainMin = g;
    for (const ch of chans) ch[i] = (ch[i] as number) * g;
  }
  return { gainMinDb: Math.round(20 * Math.log10(gainMin) * 10) / 10 };
}

type Wav = {
  channels: number;
  sampleRate: number;
  dataOffset: number;
  dataBytes: number;
};

function parseWav(bytes: Uint8Array): Wav | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt) return null;
      if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels < 1 || fmt.channels > 2) return null;
      const dataBytes = Math.min(size, bytes.byteLength - body);
      return { channels: fmt.channels, sampleRate: fmt.sampleRate, dataOffset: body, dataBytes };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * Returns the corrected WAV, or the original bytes when nothing needs doing or the file
 * is not a plain 16-bit PCM WAV.
 */
export function balanceGeneratedWav(bytes: Uint8Array): { bytes: Uint8Array; report: ToneReport } {
  try {
    const wav = parseWav(bytes);
    if (!wav) return { bytes, report: { applied: false, reason: "unsupported" } };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const frames = Math.floor(wav.dataBytes / (2 * wav.channels));
    if (frames < wav.sampleRate) return { bytes, report: { applied: false, reason: "too short" } };

    const chans: Float32Array[] = [];
    for (let c = 0; c < wav.channels; c += 1) chans.push(new Float32Array(frames));
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < wav.channels; c += 1) {
        const v = view.getInt16(wav.dataOffset + (i * wav.channels + c) * 2, true);
        (chans[c] as Float32Array)[i] = v / 32768;
      }
    }
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      let s = 0;
      for (let c = 0; c < wav.channels; c += 1) s += (chans[c] as Float32Array)[i] as number;
      mono[i] = s / wav.channels;
    }

    const shares = bandShares(mono, wav.sampleRate);
    const plan = planCorrection(shares.low, shares.high);
    const before = { lowShareBefore: shares.low, highShareBefore: shares.high };
    const balanced = plan.lowCutDb < 0.3 && plan.highBoostDb < 0.3;
    if (balanced) {
      let peak = 0;
      for (const ch of chans) for (let i = 0; i < frames; i += 1) peak = Math.max(peak, Math.abs(ch[i] as number));
      // Balanced tone still needs a safe peak; untouched only when it is already under the ceiling.
      if (peak <= PEAK_CEILING) return { bytes, report: { applied: false, reason: "already balanced", ...before } };
    }

    const chain: Biquad[] = balanced ? [] : [highPass(wav.sampleRate, 28)];
    if (plan.lowCutDb >= 0.3) chain.push(lowShelf(wav.sampleRate, 160, -plan.lowCutDb));
    if (plan.highBoostDb >= 0.3) chain.push(highShelf(wav.sampleRate, 3200, plan.highBoostDb));
    const shaped = chain.length ? chans.map((ch) => run(chain, ch)) : chans;

    const limited = limitPeaks(shaped, PEAK_CEILING, wav.sampleRate);

    const out = new Uint8Array(bytes);
    const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < wav.channels; c += 1) {
        const v = (shaped[c] as Float32Array)[i] as number;
        const q = Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
        outView.setInt16(wav.dataOffset + (i * wav.channels + c) * 2, q, true);
      }
    }
    return {
      bytes: out,
      report: {
        applied: true,
        ...before,
        lowCutDb: Math.round(plan.lowCutDb * 10) / 10,
        highBoostDb: Math.round(plan.highBoostDb * 10) / 10,
        gainDb: limited.gainMinDb,
      },
    };
  } catch {
    return { bytes, report: { applied: false, reason: "error" } };
  }
}

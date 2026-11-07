/**
 * Live rap pocket for one vocal track.
 * A region runs from a verse/hook marker until the next marker.
 * Before the first marker, and when there are no markers, the block is verse
 * gain and the hook double stays off.
 * `key` is a short RMS of the dry input (0..1) so the main thread can trim a beat.
 * Depth is only a mild, stable high-mid dip on this vocal — not the beat sidechain.
 * Split-band beat-mid duck stays in renderMixStereo.
 */

export type PocketLiveMarker = { kind: "verse" | "hook"; positionMs: number };

export type PocketLiveParams = {
  verseDb: number;
  hookDb: number;
  doubleMs: number;
  doubleDb: number;
  depth: number;
};

export class PocketLiveCore {
  verseDb = -1.5;
  hookDb = 0;
  doubleMs = 20;
  doubleDb = -14;
  depth = 0.55;
  verseGain = 1;
  hookGain = 1;
  doubleGain = 1;
  delaySamp = 1;
  playheadMs = 0;
  key = 0;
  markers: PocketLiveMarker[] = [];
  sr = 48000;
  delayLen = 8;
  delayPos = 0;
  delayL: Float32Array = new Float32Array(8);
  delayR: Float32Array = new Float32Array(8);
  lpL = 0;
  lpR = 0;
  midA = 0;

  constructor(sampleRate: number, params?: Partial<PocketLiveParams>) {
    const sr = typeof sampleRate === "number" && Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48000;
    this.sr = sr;
    this.delayLen = Math.max(8, Math.ceil(sr * 0.03) + 2);
    this.delayL = new Float32Array(this.delayLen);
    this.delayR = new Float32Array(this.delayLen);
    let a = 1 - Math.exp((-2 * Math.PI * 2800) / sr);
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    this.midA = a;
    this.setParams(params || {});
  }

  setParams(params: Partial<PocketLiveParams> | null | undefined): void {
    const p = params || {};
    const n = (v: unknown, fallback: number, lo: number, hi: number) => {
      const x = typeof v === "number" && Number.isFinite(v) ? v : fallback;
      return x < lo ? lo : x > hi ? hi : x;
    };
    this.verseDb = n(p.verseDb, -1.5, -12, 6);
    this.hookDb = n(p.hookDb, 0, -12, 6);
    this.doubleMs = n(p.doubleMs, 20, 15, 25);
    this.doubleDb = n(p.doubleDb, -14, -24, -6);
    this.depth = n(p.depth, 0.55, 0, 1);
    this.verseGain = Math.pow(10, this.verseDb / 20);
    this.hookGain = Math.pow(10, this.hookDb / 20);
    this.doubleGain = Math.pow(10, this.doubleDb / 20);
    let delay = Math.round((this.sr * this.doubleMs) / 1000);
    if (delay < 1) delay = 1;
    if (delay >= this.delayLen) delay = this.delayLen - 1;
    this.delaySamp = delay;
  }

  setPlayhead(ms: number): void {
    this.playheadMs = typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
  }

  setMarkers(markers: readonly PocketLiveMarker[] | null | undefined): void {
    const next: PocketLiveMarker[] = [];
    if (markers) {
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        if (!m) continue;
        if (m.kind !== "verse" && m.kind !== "hook") continue;
        if (typeof m.positionMs !== "number" || !Number.isFinite(m.positionMs)) continue;
        next.push({ kind: m.kind, positionMs: m.positionMs });
      }
    }
    next.sort((a, b) => a.positionMs - b.positionMs);
    this.markers = next;
  }

  /** Last marker at or before `ms`. Open start and an empty list are verse. */
  kindAt(ms: number): "verse" | "hook" {
    const list = this.markers;
    if (!list || list.length === 0) return "verse";
    let best = -Infinity;
    let kind: "verse" | "hook" = "verse";
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m) continue;
      if (m.kind !== "verse" && m.kind !== "hook") continue;
      if (typeof m.positionMs !== "number" || !Number.isFinite(m.positionMs)) continue;
      if (m.positionMs <= ms && m.positionMs >= best) {
        best = m.positionMs;
        kind = m.kind;
      }
    }
    return kind;
  }

  processBlock(
    lIn: Float32Array,
    rIn: Float32Array,
    lOut: Float32Array,
    rOut: Float32Array,
    frames: number,
  ): void {
    const n = frames > 0 ? frames | 0 : 0;
    const dt = 1000 / this.sr;
    const dip = this.depth * 0.25;
    const a = this.midA;
    let ms = this.playheadMs;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const l = (lIn && lIn[i]) || 0;
      const r = (rIn && rIn[i]) || 0;
      sum += l * l + r * r;
      count += 2;
      const hookNow = this.kindAt(ms) === "hook";
      const g = hookNow ? this.hookGain : this.verseGain;
      const wetL = l * g;
      const wetR = r * g;
      this.delayL[this.delayPos] = wetL;
      this.delayR[this.delayPos] = wetR;
      let ol = wetL;
      let orr = wetR;
      if (hookNow) {
        let idx = this.delayPos - this.delaySamp;
        if (idx < 0) idx += this.delayLen;
        ol += (this.delayL[idx] || 0) * this.doubleGain;
        orr += (this.delayR[idx] || 0) * this.doubleGain;
      }
      this.delayPos += 1;
      if (this.delayPos >= this.delayLen) this.delayPos = 0;
      if (dip > 0) {
        this.lpL += a * (ol - this.lpL);
        this.lpR += a * (orr - this.lpR);
        ol -= (ol - this.lpL) * dip;
        orr -= (orr - this.lpR) * dip;
      }
      if (lOut) lOut[i] = ol;
      if (rOut) rOut[i] = orr;
      ms += dt;
    }
    this.playheadMs = ms;
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    this.key = rms < 0 ? 0 : rms > 1 ? 1 : rms;
  }
}

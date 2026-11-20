/**
 * "Graj" sound engine (browser, Web Audio). The same voice code plays live (AudioContext)
 * and renders offline (OfflineAudioContext), so what you hear is what gets saved.
 *
 * Sampled instruments: /public/instruments/<id>/manifest.json (CC0 / CC BY, see CREDITS.txt),
 * pitched with playbackRate = 2^((note - center) / 12), soft/hard layer by velocity.
 * Drum kits: one buffer per pad. Synths: two oscillators → low-pass → envelope.
 * Decoded AudioBuffers are cached once and shared by every context.
 */

import {
  DRUM_KITS,
  SAMPLED_INSTRUMENTS,
  SYNTHS,
  beatsToSeconds,
  type DrumKitId,
  type PlayInstrumentId,
  type PlayNote,
  type PlaySession,
  type SynthId,
  type SynthParams,
} from "@/lib/studio/play/play-types";

type ZoneManifest = { file: string; center: number; lo: number; hi: number; vel: "soft" | "hard" };
type PadManifest = { id: string; file: string };
type Manifest = { id: string; attribution: string; zones?: ZoneManifest[]; pads?: PadManifest[] };

export type LoadedZone = ZoneManifest & { buffer: AudioBuffer };
export type InstrumentAssets =
  | { kind: "sampled"; id: PlayInstrumentId; attribution: string; zones: LoadedZone[] }
  | { kind: "kit"; id: PlayInstrumentId; attribution: string; pads: { id: string; buffer: AudioBuffer }[] }
  | { kind: "synth"; id: PlayInstrumentId; attribution: null };

export function isSampled(id: PlayInstrumentId): boolean {
  return (SAMPLED_INSTRUMENTS as readonly string[]).includes(id);
}
export function isKit(id: PlayInstrumentId): id is DrumKitId {
  return (DRUM_KITS as readonly string[]).includes(id);
}
export function isSynth(id: PlayInstrumentId): id is SynthId {
  return (SYNTHS as readonly string[]).includes(id);
}

export const DEFAULT_SYNTH: Record<SynthId, SynthParams> = {
  "synth-lead": { wave: "sawtooth", cutoff: 3200, resonance: 4, attack: 0.01, release: 0.25, glide: 0, detune: 8 },
  "synth-pad": { wave: "sawtooth", cutoff: 1400, resonance: 1, attack: 0.6, release: 1.2, glide: 0, detune: 12 },
  "synth-bass": { wave: "sawtooth", cutoff: 520, resonance: 6, attack: 0.005, release: 0.15, glide: 0.06, detune: 0 },
};

/** Release after note-off, per sampled instrument (a guitar string keeps ringing). */
const RELEASE: Record<string, number> = { piano: 0.35, epiano: 0.45, guitar: 1.1, bass: 0.15 };

const decoded = new Map<string, Promise<InstrumentAssets>>();

async function fetchBuffer(url: string, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Loads and decodes an instrument once; later calls (any context) get the same buffers. */
export function loadInstrument(
  id: PlayInstrumentId,
  ctx: BaseAudioContext,
  onProgress?: (done: number, total: number) => void,
): Promise<InstrumentAssets> {
  if (isSynth(id)) return Promise.resolve({ kind: "synth", id, attribution: null });
  const cached = decoded.get(id);
  if (cached) return cached;
  const job = (async (): Promise<InstrumentAssets> => {
    const base = `/instruments/${id}`;
    const res = await fetch(`${base}/manifest.json`);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest = (await res.json()) as Manifest;
    const files = manifest.zones ?? manifest.pads ?? [];
    let done = 0;
    const tick = () => onProgress?.(++done, files.length);
    if (manifest.pads) {
      const pads = await Promise.all(
        manifest.pads.map(async (p) => {
          const buffer = await fetchBuffer(`${base}/${p.file}`, ctx);
          tick();
          return { id: p.id, buffer };
        }),
      );
      return { kind: "kit", id, attribution: manifest.attribution, pads };
    }
    const zones = await Promise.all(
      (manifest.zones ?? []).map(async (z) => {
        const buffer = await fetchBuffer(`${base}/${z.file}`, ctx);
        tick();
        return { ...z, buffer };
      }),
    );
    return { kind: "sampled", id, attribution: manifest.attribution, zones };
  })();
  decoded.set(id, job);
  job.catch(() => decoded.delete(id));
  return job;
}

/** Best zone for a note: the range that holds it, hard layer for strong velocities. */
export function pickZone<Z extends ZoneManifest>(zones: Z[], note: number, velocity: number): Z | null {
  if (!zones.length) return null;
  const wantHard = velocity >= 0.62;
  const inRange = zones.filter((z) => note >= z.lo && note <= z.hi);
  const pool = inRange.length
    ? inRange
    : (() => {
        const nearest = zones.reduce((a, b) => (Math.abs(b.center - note) < Math.abs(a.center - note) ? b : a));
        return zones.filter((z) => z.center === nearest.center);
      })();
  return pool.find((z) => (z.vel === "hard") === wantHard) ?? pool[0]!;
}

export function midiToHz(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

export type VoiceHandle = { note: number; stop: (when?: number) => void };

/** Master bus: gain → gentle compressor → output. Returns the input node. */
export function createMaster(ctx: BaseAudioContext, gain = 0.8): AudioNode {
  const g = ctx.createGain();
  g.gain.value = gain;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  g.connect(comp);
  comp.connect(ctx.destination);
  return g;
}

/**
 * Start one voice at `when` (context time). For sampled/synth voices call stop() for the
 * note-off; drum hits are one-shots (stop is a no-op). `glideFrom` slides a synth from a note.
 */
export function startVoice(params: {
  ctx: BaseAudioContext;
  dest: AudioNode;
  assets: InstrumentAssets;
  note: number;
  velocity: number;
  when: number;
  gain?: number;
  synth?: SynthParams;
  glideFrom?: number | null;
}): VoiceHandle {
  const { ctx, dest, assets, note, when } = params;
  const v = Math.max(0.05, Math.min(1, params.velocity));
  const layerGain = params.gain ?? 1;
  const out = ctx.createGain();
  out.connect(dest);

  if (assets.kind === "kit") {
    const pad = assets.pads[note];
    if (!pad) return { note, stop: () => undefined };
    const src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    out.gain.value = (0.2 + 0.8 * v) * layerGain;
    src.connect(out);
    src.start(when);
    src.onended = () => out.disconnect();
    return { note, stop: () => undefined };
  }

  if (assets.kind === "sampled") {
    const zone = pickZone(assets.zones, note, v);
    if (!zone) return { note, stop: () => undefined };
    const src = ctx.createBufferSource();
    src.buffer = zone.buffer;
    src.playbackRate.value = 2 ** ((note - zone.center) / 12);
    const peak = (0.25 + 0.75 * v) * layerGain;
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(peak, when + 0.004);
    src.connect(out);
    src.start(when);
    src.onended = () => out.disconnect();
    const release = RELEASE[assets.id] ?? 0.3;
    let stopped = false;
    return {
      note,
      stop: (at?: number) => {
        if (stopped) return;
        stopped = true;
        const t = Math.max(at ?? ctx.currentTime, when + 0.01);
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(peak, t);
        out.gain.setTargetAtTime(0, t, release / 3);
        try {
          src.stop(t + release * 2);
        } catch {
          /* already stopped */
        }
      },
    };
  }

  // Synth voice.
  const p = params.synth ?? DEFAULT_SYNTH[(assets.id as SynthId) in DEFAULT_SYNTH ? (assets.id as SynthId) : "synth-lead"];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.max(60, Math.min(18000, p.cutoff * (0.7 + 0.5 * v)));
  filter.Q.value = Math.max(0, Math.min(20, p.resonance));
  filter.connect(out);
  const oscs: OscillatorNode[] = [];
  const freq = midiToHz(note);
  const from = params.glideFrom != null && p.glide > 0 ? midiToHz(params.glideFrom) : null;
  for (const cents of p.detune ? [-p.detune / 2, p.detune / 2] : [0]) {
    const o = ctx.createOscillator();
    o.type = p.wave;
    o.detune.value = cents;
    if (from) {
      o.frequency.setValueAtTime(from, when);
      o.frequency.exponentialRampToValueAtTime(freq, when + p.glide);
    } else {
      o.frequency.setValueAtTime(freq, when);
    }
    o.connect(filter);
    o.start(when);
    oscs.push(o);
  }
  const sustainLevel = assets.id === "synth-pad" ? 0.9 : 0.75;
  const peak = (0.12 + 0.18 * v) * layerGain * (oscs.length > 1 ? 0.7 : 1);
  out.gain.setValueAtTime(0, when);
  out.gain.linearRampToValueAtTime(peak, when + Math.max(0.003, p.attack));
  out.gain.setTargetAtTime(peak * sustainLevel, when + Math.max(0.003, p.attack), 0.15);
  let stopped = false;
  return {
    note,
    stop: (at?: number) => {
      if (stopped) return;
      stopped = true;
      const t = Math.max(at ?? ctx.currentTime, when + 0.005);
      const rel = Math.max(0.02, p.release);
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value || peak * sustainLevel, t);
      out.gain.setTargetAtTime(0, t, rel / 3);
      for (const o of oscs) {
        try {
          o.stop(t + rel * 2.5);
        } catch {
          /* already stopped */
        }
      }
      oscs[0]!.onended = () => out.disconnect();
    },
  };
}

/** A metronome tick: higher and louder on the bar's first beat. */
export function scheduleClick(ctx: BaseAudioContext, dest: AudioNode, when: number, accent: boolean): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.2, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + 0.08);
}

// ---------------------------------------------------------------------------------------
// Live engine

export class PlayEngine {
  ctx: AudioContext | null = null;
  master: AudioNode | null = null;
  private assets = new Map<PlayInstrumentId, InstrumentAssets>();
  private active = new Map<string, VoiceHandle>();
  private held = new Set<string>();
  private sustain = false;
  private lastSynthNote = new Map<string, number>();

  /** Must run inside a user gesture the first time (browser autoplay rules). */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = createMaster(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  async load(id: PlayInstrumentId, onProgress?: (done: number, total: number) => void): Promise<InstrumentAssets> {
    const ctx = this.ensure();
    const a = await loadInstrument(id, ctx, onProgress);
    this.assets.set(id, a);
    return a;
  }

  loaded(id: PlayInstrumentId): InstrumentAssets | null {
    return this.assets.get(id) ?? null;
  }

  /** Live note-on. `voiceKey` identifies the finger/key so note-off finds the voice. */
  noteOn(voiceKey: string, id: PlayInstrumentId, note: number, velocity: number, synth?: SynthParams, gain = 1): void {
    const assets = this.assets.get(id);
    if (!assets || !this.ctx || !this.master) return;
    this.active.get(voiceKey)?.stop();
    const glideFrom = isSynth(id) ? this.lastSynthNote.get(id) ?? null : null;
    const v = startVoice({ ctx: this.ctx, dest: this.master, assets, note, velocity, when: this.ctx.currentTime, synth, glideFrom, gain });
    if (isSynth(id)) this.lastSynthNote.set(id, note);
    this.active.set(voiceKey, v);
    this.held.add(voiceKey);
  }

  noteOff(voiceKey: string): void {
    this.held.delete(voiceKey);
    if (this.sustain) return;
    this.active.get(voiceKey)?.stop();
    this.active.delete(voiceKey);
  }

  setSustain(on: boolean): void {
    this.sustain = on;
    if (on) return;
    for (const [k, v] of this.active) {
      if (!this.held.has(k)) {
        v.stop();
        this.active.delete(k);
      }
    }
  }

  allOff(): void {
    for (const v of this.active.values()) v.stop();
    this.active.clear();
    this.held.clear();
  }

  /** Schedule a note at a context time (playback of recorded layers). */
  schedule(id: PlayInstrumentId, note: PlayNote, when: number, durSec: number, synth?: SynthParams, gain = 1): void {
    const assets = this.assets.get(id);
    if (!assets || !this.ctx || !this.master) return;
    const v = startVoice({ ctx: this.ctx, dest: this.master, assets, note: note.n, velocity: note.v, when, synth, gain });
    v.stop(when + Math.max(0.02, durSec));
  }

  click(when: number, accent: boolean): void {
    if (this.ctx && this.master) scheduleClick(this.ctx, this.master, when, accent);
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

/**
 * Loop player: schedules the session's layers ahead of time (25 ms tick, 120 ms lookahead),
 * with an optional metronome and count-in. Beat 0 of the loop is `loopStart` (context time).
 */
export class LoopPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledUntil = 0;
  loopStart = 0;
  running = false;
  private session: PlaySession | null = null;
  private metronome = false;

  constructor(private engine: PlayEngine) {}

  setSession(s: PlaySession): void {
    this.session = s;
  }

  setMetronome(on: boolean): void {
    this.metronome = on;
  }

  loopSeconds(): number {
    return this.session ? beatsToSeconds(this.session.bars * 4, this.session.bpm) : 0;
  }

  /** Current position in beats inside the loop (negative during the count-in). */
  beatNow(): number {
    if (!this.running || !this.session) return 0;
    const sec = this.engine.now() - this.loopStart;
    if (sec < 0) return (sec * this.session.bpm) / 60;
    const beats = (sec * this.session.bpm) / 60;
    return beats % (this.session.bars * 4);
  }

  /** Absolute beats since loop start (no wrap) — for recording. */
  beatsSinceStart(at?: number): number {
    if (!this.session) return 0;
    return (((at ?? this.engine.now()) - this.loopStart) * this.session.bpm) / 60;
  }

  start(countInBeats: number): void {
    const ctx = this.engine.ensure();
    if (!this.session) return;
    this.stop();
    this.running = true;
    const spb = 60 / this.session.bpm;
    this.loopStart = ctx.currentTime + 0.08 + countInBeats * spb;
    // Count-in clicks.
    for (let i = 0; i < countInBeats; i++) this.engine.click(this.loopStart - (countInBeats - i) * spb, i % 4 === 0);
    this.scheduledUntil = this.loopStart;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  private tick(): void {
    const s = this.session;
    if (!s || !this.running) return;
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + 0.12;
    if (horizon <= this.scheduledUntil) return;
    const from = this.scheduledUntil;
    const to = horizon;
    const loopSec = this.loopSeconds();
    const spb = 60 / s.bpm;
    // Metronome beats in [from, to).
    if (this.metronome) {
      const firstBeat = Math.ceil((from - this.loopStart) / spb - 1e-9);
      for (let b = firstBeat; this.loopStart + b * spb < to; b++) {
        const t = this.loopStart + b * spb;
        if (t >= from) this.engine.click(t, ((b % 4) + 4) % 4 === 0);
      }
    }
    // Layer notes for every loop pass overlapping the window.
    const events = buildLiveEvents(s);
    const firstPass = Math.max(0, Math.floor((from - this.loopStart) / loopSec));
    const lastPass = Math.floor((to - this.loopStart) / loopSec);
    for (let pass = firstPass; pass <= lastPass; pass++) {
      const passStart = this.loopStart + pass * loopSec;
      for (const e of events) {
        const t = passStart + e.time;
        if (t >= from && t < to) this.engine.schedule(e.instrument, e.note, t, e.dur, e.synth, e.gain);
      }
    }
    this.scheduledUntil = to;
  }
}

export type LiveEvent = {
  time: number;
  dur: number;
  instrument: PlayInstrumentId;
  note: PlayNote;
  synth?: SynthParams;
  gain: number;
};

/** Seconds-based events of all unmuted layers (swing applied), one loop pass. */
export function buildLiveEvents(s: PlaySession): LiveEvent[] {
  const beats = s.bars * 4;
  const out: LiveEvent[] = [];
  for (const layer of s.layers) {
    if (layer.muted) continue;
    for (const n of layer.notes) {
      if (n.t < 0 || n.t >= beats) continue;
      const t = swingBeat(n.t, s.swing);
      out.push({
        time: beatsToSeconds(t, s.bpm),
        dur: beatsToSeconds(Math.max(0.05, n.d), s.bpm),
        instrument: layer.instrument,
        note: n,
        synth: layer.synth,
        gain: layer.gain,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Swing: an off-beat 1/16 (odd sixteenth) is delayed by swing × 1/8 beat
 * (swing 0.6 ≈ triplet feel). Notes off the 1/16 grid are left alone.
 */
export function swingBeat(t: number, swing: number): number {
  if (!(swing > 0)) return t;
  const p = t * 4;
  const r = Math.round(p);
  if (Math.abs(p - r) > 0.08 || r % 2 === 0) return t;
  return t + Math.min(0.6, swing) * 0.125;
}

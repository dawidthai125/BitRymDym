/**
 * Parity: E3 mix render (ffmpeg decode/resample → shared TS DSP) vs the browser preview
 * (sources already at 44.1 kHz → same DSP). Track FX (EQ, compressor, de-esser-ish EQ,
 * reverb, delay), gain/pan and a master limiter are all in the chain.
 * Criteria: |ΔLUFS| ≤ 0.5 LU, correlation ≥ 0.99.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { MixAnalysisInput, MixAnalysisSource } from "@/lib/studio/mix-analysis/render";
import { createStudioFxInstance } from "@/lib/studio/studio-fx-chain";

import { lufsOf, type Stereo } from "./dsp";
import { renderMixStereo } from "./render-mix";
import { ffmpegDecodeArgs, parseDecodedWav } from "./render-io";

const SR = 44100;
const SRC_SR = 48000; // takes are recorded at 48 kHz → the server must resample
const SECONDS = 12;
let hasFfmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { hasFfmpeg = false; }

/** Vocal-ish: 180 Hz harmonics with vibrato + sibilant 6–9 kHz bursts (deterministic, so both sample rates carry the same signal); mono. */
function vocal(sr: number): Float32Array {
  const n = SECONDS * sr; const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr; const f = 180 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t)); let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t);
    const sib = (t % 2) > 1.8 ? 0.3 * (Math.sin(2 * Math.PI * 6100 * t) + Math.sin(2 * Math.PI * 7900 * t + 1) + Math.sin(2 * Math.PI * 9300 * t + 2)) / 3 : 0;
    o[i] = 0.25 * env * v + sib * 0.2;
  }
  return o;
}
/** Beat-ish stereo: 60 Hz kick pulses + hats (smooth, band-limited so resampling is fair). */
function beat(sr: number): [Float32Array, Float32Array] {
  const n = SECONDS * sr; const l = new Float32Array(n); const rr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr; const ph = t % 0.5; const kick = Math.exp(-ph * 18) * Math.sin(2 * Math.PI * 60 * ph);
    const hat = Math.exp(-((t + 0.25) % 0.5) * 60) * Math.sin(2 * Math.PI * 7000 * t);
    l[i] = 0.5 * kick + 0.08 * hat; rr[i] = 0.5 * kick + 0.08 * hat * Math.cos(2 * Math.PI * 0.2 * t);
  }
  return [l, rr];
}
function wavFloat(ch: Float32Array[], sr: number): Buffer {
  const n = ch[0]!.length; const c = ch.length; const data = n * c * 4; const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8, "ascii"); b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * c * 4, 28);
  b.writeUInt16LE(c * 4, 32); b.writeUInt16LE(32, 34); b.write("data", 36, "ascii"); b.writeUInt32LE(data, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeFloatLE(ch[k]![i]!, 44 + (i * c + k) * 4);
  return b;
}
function serverDecode(dir: string, name: string, ch: Float32Array[]): MixAnalysisSource {
  const src = path.join(dir, `${name}.wav`); const out = path.join(dir, `${name}-dec.wav`);
  writeFileSync(src, wavFloat(ch, SRC_SR));
  execFileSync("ffmpeg", ffmpegDecodeArgs(src, out, SR));
  return parseDecodedWav(readFileSync(out));
}

let n = 0;
const id = () => `3fa85f64-5717-4562-b3fc-2c963f66a${String(++n).padStart(3, "0")}`;
function input(sources: Record<string, MixAnalysisSource>): MixAnalysisInput {
  const vocalFx = { schemaVersion: 1, effects: ["eq", "compressor", "reverb", "delay"].map((t) => createStudioFxInstance(t as never, id)) };
  const masterFx = { schemaVersion: 1, effects: [createStudioFxInstance("limiter", id)] };
  const clip = (trackId: string, sourceKey: string) => ({ trackId, sourceKey, sourceOffsetMs: 0, timelineStartMs: 0, durationMs: SECONDS * 1000, gainDb: 0, muted: false, fadeInMs: 20, fadeOutMs: 200 });
  return {
    sampleRate: SR, lengthMs: SECONDS * 1000, masterGainDb: -1, masterPan: 0, masterEffectsChain: masterFx,
    tracks: [
      { id: "b", name: "Bit", role: "beat", gainDb: -3, pan: 0, muted: false, solo: false },
      { id: "v", name: "Wokal", role: "lead_vocal", gainDb: 2, pan: -0.2, muted: false, solo: false, effectsChain: vocalFx },
      { id: "d", name: "Dubel", role: "double", gainDb: -6, pan: 0.5, muted: false, solo: false, effectsChain: { schemaVersion: 1, effects: [createStudioFxInstance("eq", id)] } },
    ] as MixAnalysisInput["tracks"],
    clips: [clip("b", "beat:1"), clip("v", "take:1"), clip("d", "take:1")],
    sources,
  };
}
function corr(a: Stereo, b: Stereo): number {
  const len = Math.min(a.left.length, b.left.length); let ab = 0, aa = 0, bb = 0;
  for (const [x, y] of [[a.left, b.left], [a.right, b.right]] as const) for (let i = 0; i < len; i++) { ab += x[i]! * y[i]!; aa += x[i]! ** 2; bb += y[i]! ** 2; }
  return ab / Math.sqrt(aa * bb);
}

describe.skipIf(!hasFfmpeg)("E3 mix render ≡ browser preview", () => {
  it("ΔLUFS ≤ 0.5 and correlation ≥ 0.99 (mix and raw)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "parity-"));
    try {
      const browser = input({ "beat:1": { channels: beat(SR) }, "take:1": { channels: [vocal(SR)] } });
      n = 0;
      const server = input({ "beat:1": serverDecode(dir, "beat", beat(SRC_SR)), "take:1": serverDecode(dir, "vocal", [vocal(SRC_SR)]) });
      expect(server.sources["take:1"]!.channels.length).toBe(1); // mono take stays mono
      for (const opts of [{}, { raw: true }]) {
        const a = renderMixStereo(browser, opts); const b = renderMixStereo(server, opts);
        const d = Math.abs(lufsOf(a) - lufsOf(b)); const c = corr(a, b);
        console.info(`parity ${JSON.stringify(opts)}: browser ${lufsOf(a).toFixed(2)} LUFS, E3 ${lufsOf(b).toFixed(2)} LUFS, Δ ${d.toFixed(3)} LU, corr ${c.toFixed(5)}`);
        expect(d).toBeLessThanOrEqual(0.5);
        expect(c).toBeGreaterThanOrEqual(0.99);
        expect(Math.abs(lufsOf(a))).toBeLessThan(60); // sanity: not silent
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

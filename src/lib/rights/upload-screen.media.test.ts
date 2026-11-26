/**
 * Real Chromaprint run of the upload screen (owner order 2026-11-26). Needs ffmpeg and fpcalc
 * (FPCALC_BIN or fpcalc on PATH). Excluded from the default run: `npm run test:media`.
 *
 * A synthetic 60 s track stands in for a taken-down file (no real catalogue audio is used).
 * Every re-upload variant from the order must be refused: MP3, another bitrate, −3 dB, cut by 5 s
 * (and all of them at once); a different track must pass. The catalogue-beat rule is checked too.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveFfmpegBin } from "@/lib/audio/native-ffmpeg";
import { fingerprintFile } from "@/lib/rights/rights-worker";
import { judgeUpload } from "@/lib/rights/upload-screen-worker";

const SR = 44100;
const cfg = { fpcalcBin: process.env.FPCALC_BIN ?? "fpcalc", maxDurationSeconds: 600 };

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A beat-like track: chords, bass, melody, kick and hats, all from one seed. 16-bit stereo WAV. */
function synthTrack(seed: number, seconds: number): Buffer {
  const r = rng(seed);
  const n = SR * seconds;
  const out = new Int16Array(n * 2);
  const bpm = 80 + Math.floor(r() * 60);
  const beat = (60 / bpm) * SR;
  const scale = [0, 2, 3, 5, 7, 8, 10];
  const root = 45 + Math.floor(r() * 12);
  const chords = Array.from({ length: 8 }, () => scale[Math.floor(r() * scale.length)]!);
  const melody = Array.from({ length: 64 }, () => (r() < 0.2 ? null : scale[Math.floor(r() * scale.length)]! + 12 * (1 + Math.floor(r() * 2))));
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  let noise = seed;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const b = i / beat;
    const bar = Math.floor(b / 4) % chords.length;
    const c = root + chords[bar]!;
    let s = 0;
    for (const iv of [0, 3, 7]) s += 0.08 * Math.sin(2 * Math.PI * hz(c + 12 + iv) * t);
    s += 0.18 * Math.sin(2 * Math.PI * hz(c - 12) * t);
    const step = Math.floor(b * 2) % melody.length;
    const m = melody[step];
    const env = Math.exp(-6 * ((b * 2) % 1));
    if (m !== null && m !== undefined) s += 0.15 * env * Math.sign(Math.sin(2 * Math.PI * hz(root + m) * t));
    const kb = b % 1;
    s += 0.5 * Math.exp(-25 * kb) * Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-30 * kb)) * t);
    noise = (Math.imul(noise, 1103515245) + 12345) >>> 0;
    s += 0.05 * Math.exp(-40 * ((b * 2) % 1)) * ((noise / 4294967296) * 2 - 1);
    const v = Math.max(-1, Math.min(1, s)) * 0.8 * 32767;
    out[2 * i] = v;
    out[2 * i + 1] = v;
  }
  const data = Buffer.from(out.buffer);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let dir = "";
const file = (name: string) => path.join(dir, name);
const ff = (args: string[]) => execFileSync(resolveFfmpegBin(), ["-nostdin", "-v", "error", "-y", ...args]);
const print = (name: string) => fingerprintFile(cfg, dir, file(name));

describe("upload screen — real Chromaprint (taken-down file re-uploaded)", () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "brd-screen-media-"));
    writeFileSync(file("taken-down.wav"), synthTrack(1, 60));
    writeFileSync(file("other.wav"), synthTrack(2, 60));
    writeFileSync(file("vocal.wav"), synthTrack(3, 60));
    ff(["-i", file("taken-down.wav"), "-c:a", "libmp3lame", "-b:a", "192k", file("as-mp3-192.mp3")]);
    ff(["-i", file("taken-down.wav"), "-c:a", "libmp3lame", "-b:a", "96k", file("as-mp3-96.mp3")]);
    ff(["-i", file("taken-down.wav"), "-af", "volume=-3dB", file("minus-3db.wav")]);
    ff(["-ss", "5", "-i", file("taken-down.wav"), file("cut-5s.wav")]);
    ff(["-ss", "5", "-i", file("taken-down.wav"), "-af", "volume=-3dB", "-c:a", "libmp3lame", "-b:a", "128k", file("all-at-once.mp3")]);
    // A vocal take recorded over the project beat (the beat bleeds in at −12 dB).
    ff(["-i", file("vocal.wav"), "-i", file("taken-down.wav"), "-filter_complex", "[1:a]volume=-12dB[b];[0:a][b]amix=inputs=2:normalize=0", file("vocal-over-beat.wav")]);
  }, 120_000);
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("refuses every re-upload variant of the taken-down file, passes a different file", async () => {
    const blocked = await print("taken-down.wav");
    const ref = [{ id: "blocked-1", fingerprint: blocked.raw, durationSeconds: blocked.duration }];
    const verdicts: Record<string, unknown> = {};
    for (const name of ["taken-down.wav", "as-mp3-192.mp3", "as-mp3-96.mp3", "minus-3db.wav", "cut-5s.wav", "all-at-once.mp3"]) {
      const v = judgeUpload({ print: await print(name), ownerId: "user-a", allowedBeatId: null, blocked: ref, beats: [] });
      verdicts[name] = v;
      expect(v, name).toMatchObject({ outcome: "blocked", matchKind: "blocked_fingerprint", blockedId: "blocked-1" });
    }
    const other = judgeUpload({ print: await print("other.wav"), ownerId: "user-a", allowedBeatId: null, blocked: ref, beats: [] });
    expect(other).toEqual({ outcome: "passed" });
    // Evidence for the report (scores per variant).
    console.log(JSON.stringify(verdicts));
  }, 120_000);

  it("catalogue beat: refused as someone's upload, allowed as the project's own beat bleeding into a vocal", async () => {
    const beat = await print("taken-down.wav");
    const beats = [{ id: "beat-x", ownerId: "producer", fingerprint: beat.raw }];
    const copy = await print("as-mp3-192.mp3");
    expect(judgeUpload({ print: copy, ownerId: "user-a", allowedBeatId: null, blocked: [], beats })).toMatchObject({ outcome: "blocked", matchKind: "catalog_fingerprint", catalogBeatId: "beat-x" });
    // The same beat is the project beat → allowed; the producer's own beat → allowed.
    expect(judgeUpload({ print: copy, ownerId: "user-a", allowedBeatId: "beat-x", blocked: [], beats })).toEqual({ outcome: "passed" });
    expect(judgeUpload({ print: copy, ownerId: "producer", allowedBeatId: null, blocked: [], beats })).toEqual({ outcome: "passed" });
    // A real vocal take over the project beat passes.
    const take = await print("vocal-over-beat.wav");
    expect(judgeUpload({ print: take, ownerId: "user-a", allowedBeatId: "beat-x", blocked: [], beats })).toEqual({ outcome: "passed" });
  }, 120_000);
});

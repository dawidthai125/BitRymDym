/**
 * E3 render benchmark / smoke (synthetic audio, no DB, no network):
 *   npx tsx --import ./scripts/register-server-only-stub.mjs scripts/studio-master-render-bench.ts
 * Env: SEC (song length, default 240), TRACKS (default 8), TH (comma list of thread
 * counts; 0 = serial reference renderMixStereo, default "0,3"), MASTER=1 also runs
 * master.py (STUDIO_MASTER_PYTHON / STUDIO_MASTER_SCRIPT) on the last render.
 * Prints JSON lines: renderMs, max |Δ| vs the first render, peak RSS.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStudioFxInstance, type StudioFxType } from "../src/lib/studio/studio-fx-chain";
import type { Stereo } from "../src/lib/studio/master/dsp";
import { renderMixStereo } from "../src/lib/studio/master/render-mix";
import { renderMixStereoParallel } from "../src/lib/studio/master/render-mix-parallel";
import { writeWavFloat } from "../src/lib/studio/master/server-render";
import type { MixAnalysisInput } from "../src/lib/studio/mix-analysis/render";

const SR = 44100;
const SEC = Number(process.env.SEC ?? 240);
const TRACKS = Number(process.env.TRACKS ?? 8);
const N = SEC * SR;
let k = 0;
const id = () => `3fa85f64-5717-4562-b3fc-2c963f66a${String(++k).padStart(3, "0")}`;

function fx(t: StudioFxType) {
  const e = createStudioFxInstance(t, id);
  const p = e.params as Record<string, number>;
  if (t === "reverb") Object.assign(p, { mix: 0.2, decaySeconds: 1.8 });
  if (t === "delay") p.mix = 0.15;
  if (t === "deesser") p.thresholdDb = -30;
  if (t === "compressor") p.thresholdDb = -20;
  return e;
}

const sources: MixAnalysisInput["sources"] = {};
const tracks: unknown[] = [];
const clips: unknown[] = [];
for (let t = 0; t < TRACKS; t++) {
  const ch = new Float32Array(new SharedArrayBuffer(N * 4));
  const f = 110 * (t + 1);
  for (let i = 0; i < N; i++) ch[i] = 0.2 * Math.sin((2 * Math.PI * f * i) / SR) * (0.6 + 0.4 * Math.sin(i / SR));
  const chans = [ch];
  if (t === 0) { const c2 = new Float32Array(new SharedArrayBuffer(N * 4)); c2.set(ch); chans.push(c2); }
  sources[`s${t}`] = { channels: chans };
  const chain: StudioFxType[] = t === 0 ? ["eq", "compressor"] : ["highpass", "eq", "deesser", "compressor", "delay", "reverb"];
  tracks.push({ id: `t${t}`, name: `T${t}`, role: t === 0 ? "beat" : "lead_vocal", gainDb: -3, pan: ((t % 3) - 1) * 0.4, muted: false, solo: false,
    effectsChain: { schemaVersion: 1, effects: chain.map(fx) } });
  clips.push({ trackId: `t${t}`, sourceKey: `s${t}`, sourceOffsetMs: 0, timelineStartMs: 0, durationMs: SEC * 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 });
}
const input = { sampleRate: SR, lengthMs: SEC * 1000, masterGainDb: 0, masterPan: 0,
  masterEffectsChain: { schemaVersion: 1, effects: [fx("limiter")] }, tracks, clips, sources } as unknown as MixAnalysisInput;

(async () => {
  let ref: Stereo | null = null;
  let last: Stereo | null = null;
  for (const th of (process.env.TH ?? "0,3").split(",").map(Number)) {
    const t0 = Date.now();
    const out = th === 0 ? renderMixStereo(input) : await renderMixStereoParallel(input, {}, th);
    const renderMs = Date.now() - t0;
    ref ??= out;
    let md = 0;
    for (let i = 0; i < out.left.length; i++) md = Math.max(md, Math.abs(out.left[i] - ref.left[i]), Math.abs(out.right[i] - ref.right[i]));
    console.log(JSON.stringify({ th, sec: SEC, tracks: TRACKS, renderMs, maxDiffVsFirst: md, rssMb: Math.round(process.resourceUsage().maxRSS / 1024) }));
    last = out;
  }
  if (process.env.MASTER === "1" && last && process.env.STUDIO_MASTER_PYTHON && process.env.STUDIO_MASTER_SCRIPT) {
    const dir = mkdtempSync(path.join(tmpdir(), "render-bench-"));
    try {
      const wav = path.join(dir, "mix.wav");
      await writeWavFloat(wav, last);
      const t0 = Date.now();
      const r = spawnSync(process.env.STUDIO_MASTER_PYTHON, [process.env.STUDIO_MASTER_SCRIPT, "master", "--in", wav, "--out", path.join(dir, "m.flac"), "--target", "streaming", "--settings", "{}"], { encoding: "utf8" });
      console.log(JSON.stringify({ masterMs: Date.now() - t0, code: r.status, out: (r.stdout || "").trim().split("\n").pop()?.slice(0, 200) }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
})();

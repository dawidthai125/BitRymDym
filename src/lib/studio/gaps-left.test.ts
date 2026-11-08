import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { measureBeatWindow } from "@/lib/studio/analysis/measure";
import { countsTowardCleanupQuota } from "@/lib/studio/cleanup/cleanup-core";
import { decideNoiseSave } from "@/lib/studio/noise-decision";
import { decideSeparatorWorker, demucsStemFile, separateObjectKey, separateSourceExt } from "@/lib/studio/separate/separate-worker-env";
import { applyNoiseProfile, noiseProfileFromSelection } from "@/lib/studio/studio-clip-noise";
import { encodeMonoWav16, readCanonicalWavInfo } from "@/lib/studio/studio-wav-mono";

function sine(freq: number, seconds: number, amp: number, rate = 44100): Float32Array {
  const n = Math.floor(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

describe("remaining studio gaps", () => {
  it("mono wav round-trips the header and keeps the frame count", () => {
    const samples = sine(440, 0.05, 0.5);
    const wav = encodeMonoWav16(samples, 44100);
    const info = readCanonicalWavInfo(wav);
    expect(info).toMatchObject({ sampleRate: 44100, channels: 1, bits: 16, dataBytes: samples.length * 2 });
    expect(wav.byteLength).toBe(44 + samples.length * 2);
  });

  it("noise save refuses a 20 second preview of a longer take", () => {
    expect(decideNoiseSave({ wavSeconds: 20, byteSize: 20 * 44100 * 2 + 44, takeSeconds: 120 })).toEqual({
      ok: false,
      error: "truncated",
    });
    expect(decideNoiseSave({ wavSeconds: 120, byteSize: 120 * 44100 * 2 + 44, takeSeconds: 120 }).ok).toBe(true);
    expect(decideNoiseSave({ wavSeconds: 400, byteSize: 1000, takeSeconds: 400 })).toEqual({ ok: false, error: "too_long" });
  });

  it("spectral gate keeps the buffer length", () => {
    const mono = sine(220, 0.2, 0.2);
    const out = applyNoiseProfile(mono, 44100, noiseProfileFromSelection(mono, 44100), 0.6);
    expect(out.length).toBe(mono.length);
  });

  it("measures a hot peak, a quiet file, and a dark tone without changing samples", () => {
    const hot = measureBeatWindow(sine(1000, 0.1, 1), 44100);
    expect(hot.suggestion).toBe("hot");
    expect(hot.lowerByDb).toBe(6);
    const quiet = measureBeatWindow(sine(1000, 0.1, 0.01), 44100);
    expect(quiet.suggestion).toBe("quiet");
    const mud = measureBeatWindow(sine(100, 0.1, 0.2), 44100);
    expect(mud.suggestion).toBe("mud");
    expect(mud.centroidHz).toBeLessThan(800);
  });

  it("separator worker stays off unless the host enables it and names Demucs", () => {
    expect(decideSeparatorWorker({}, 1).action).toBe("exit_disabled");
    expect(decideSeparatorWorker({ SEPARATOR_ENABLED: "true" }, 1)).toMatchObject({ reason: "DEMUCS_PYTHON missing" });
    const run = decideSeparatorWorker({ SEPARATOR_ENABLED: "true", DEMUCS_PYTHON: "/opt/demucs/bin/python" }, 7, "/app");
    expect(run).toMatchObject({ action: "run", python: "/opt/demucs/bin/python", workerRef: "studio-separate-7" });
    expect(demucsStemFile("/tmp/out", "source", "vocals")).toBe(path.join("/tmp/out", "htdemucs", "source", "vocals.wav"));
    expect(separateObjectKey("owner", "job", "bass")).toBe("separate/owner/job/bass.wav");
    expect(separateObjectKey("owner", "job", "bass", "flac")).toBe("separate/owner/job/bass.flac");
    expect(separateSourceExt("beats/a/master.MP3")).toBe("mp3");
    expect(separateSourceExt("no-ext")).toBe("bin");
    expect(separateSourceExt("../secret.wav")).toBe("wav");
  });

  it("a saved noise profile does not spend the vocal cleanup quota", () => {
    expect(countsTowardCleanupQuota({ source: "clip_noise" })).toBe(false);
    expect(countsTowardCleanupQuota({ noise: 0.6, reverb: 0.4 })).toBe(true);
    expect(countsTowardCleanupQuota(null)).toBe(true);
  });

  it("separate migration lets only service_role write", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261108150000_studio_separate_jobs.sql"), "utf8");
    expect(sql).toMatch(/revoke all on function public\.enqueue_studio_separate_job\(uuid, uuid, text, text, text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.enqueue_studio_separate_job\(uuid, uuid, text, text, text\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.enqueue_studio_separate_job[\s\S]*to authenticated/);
    expect(sql).toMatch(/studio_separate_jobs_active_uq/);
    const quota = readFileSync(path.join(process.cwd(), "supabase/migrations/20261108160000_studio_cleanup_quota_ignores_clip_noise.sql"), "utf8");
    expect(quota).toMatch(/clip_noise/);
    expect(quota).toMatch(/revoke all on function public\.enqueue_studio_cleanup_job/);
  });
});

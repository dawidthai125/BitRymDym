import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => { throw new Error("no network in tests"); } }));

import { cleanupObjectKey, decideStudioCleanupWorkerConfig } from "./cleanup-worker-env";
import { cleanTakeFile } from "./cleanup-worker";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe("cleanup worker", () => {
  it("kill switch + defaults", () => {
    expect(decideStudioCleanupWorkerConfig({}, 1).action).toBe("exit_disabled");
    const c = decideStudioCleanupWorkerConfig({ STUDIO_CLEANUP_ENABLED: "true", STUDIO_CLEANUP_POLL_MS: "5" }, 7);
    expect(c).toMatchObject({ action: "run", workerRef: "studio-cleanup-7", pollMs: 4000, timeoutMs: 180000 });
    expect(cleanupObjectKey("o", "t", "j")).toBe("studio-cleanup/o/t/j.flac");
  });

  it.skipIf(!hasFfmpeg)("decodes, cleans and writes a FLAC with the same duration and channels", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "clean-test-"));
    try {
      const src = path.join(dir, "in.webm");
      // 2 s tone + 1 s quiet noise gap + 2 s tone, mono opus (like a browser take).
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        "sine=f=220:d=5,volume='if(between(t,2,3),0.02,0.5)':eval=frame", "-f", "lavfi", "-i", "anoisesrc=a=0.01:d=5",
        "-filter_complex", "amix=inputs=2:normalize=0", "-ac", "1", "-c:a", "libopus", src]);
      const { flac, metrics } = await cleanTakeFile({ timeoutMs: 60000 }, dir, src, { noise: 0.7, reverb: 0.3 });
      expect((await stat(flac)).size).toBeGreaterThan(1000);
      const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=channels,sample_rate,duration,bits_per_raw_sample", "-of", "json", flac]).toString();
      const s = JSON.parse(info).streams[0];
      expect(s.channels).toBe(1);
      expect(Number(s.sample_rate)).toBe(44100);
      expect(Math.abs(Number(s.duration) - 5)).toBeLessThan(0.05);
      expect(metrics.noiseReductionDb).toBeGreaterThan(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
});

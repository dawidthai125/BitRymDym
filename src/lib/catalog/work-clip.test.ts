import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildPreviewFfmpegArgs } from "@/lib/beats/preview/beat-preview";

import {
  shouldQueueWorkClip,
  WORK_CLIP_RETRY_AFTER_MS,
  workClipFfmpegArgs,
  workClipKeyFor,
  workClipNeedsWatermark,
  workClipOf,
  workClipSourceFor,
  workClipWindow,
} from "./work-clip";

const MASTER = "studio-master/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/out/master.flac";

describe("work clip — key", () => {
  it("sits next to the approved master, nothing else maps", () => {
    expect(workClipKeyFor(MASTER)).toBe(MASTER.replace(/master\.flac$/, "master_clip.mp3"));
    expect(workClipKeyFor(MASTER.replace("master.flac", "transcode.mp3"))).toBeNull();
    expect(workClipKeyFor(MASTER.replace("master.flac", "master_preview.mp3"))).toBeNull();
    expect(workClipKeyFor("other/a/b/c/out/master.flac")).toBeNull();
    expect(workClipKeyFor(`${MASTER}.p001`)).toBeNull();
  });
});

describe("work clip — window", () => {
  it("normal song: from 30 s, 45 s long", () => {
    expect(workClipWindow(180)).toEqual({ start: 30, length: 45 });
    expect(workClipWindow(240)).toEqual({ start: 30, length: 45 });
  });
  it("start = 25 % for songs under 2 min; never more than half the song is public", () => {
    expect(workClipWindow(100)).toEqual({ start: 25, length: 45 });
    expect(workClipWindow(60)).toEqual({ start: 15, length: 30 });
    expect(workClipWindow(10)).toEqual({ start: 2.5, length: 5 });
    for (const d of [4, 7.3, 33, 61, 89.9, 90, 91, 200, 600]) {
      const w = workClipWindow(d)!;
      expect(w.length).toBeLessThanOrEqual(Math.min(45, d / 2) + 0.001);
      expect(w.start + w.length).toBeLessThanOrEqual(d + 0.001);
    }
  });
  it("unknown or too short → no clip", () => {
    expect(workClipWindow(null)).toBeNull();
    expect(workClipWindow(Number.NaN)).toBeNull();
    expect(workClipWindow(3.9)).toBeNull();
  });
});

describe("work clip — ffmpeg args", () => {
  it("input seek, 45 s, fade in + fade out 1 s, 128k stereo 44.1 kHz MP3, no metadata", () => {
    const a = workClipFfmpegArgs({ input: "m.flac", output: "c.mp3", start: 30, length: 45 });
    expect(a.indexOf("-ss")).toBeLessThan(a.indexOf("-i"));
    expect(a.slice(a.indexOf("-ss"), a.indexOf("-ss") + 2)).toEqual(["-ss", "30.000"]);
    expect(a.slice(a.indexOf("-t"), a.indexOf("-t") + 2)).toEqual(["-t", "45"]);
    expect(a).toContain("afade=t=in:st=0:d=1.000,afade=t=out:st=44.000:d=1.000");
    expect(a).toEqual(expect.arrayContaining(["libmp3lame", "128k", "-map_metadata", "-1", "-ac", "2", "-ar", "44100", "-vn"]));
    expect(a.at(-1)).toBe("c.mp3");
  });
  it("the shared beat preview args stay unchanged without start / fade-in", () => {
    const a = buildPreviewFfmpegArgs({ input: "in.bin", output: "out.mp3" });
    expect(a).not.toContain("-ss");
    expect(a).toContain("afade=t=out:st=18.500:d=1.500");
  });
});

describe("work clip — state", () => {
  const key = MASTER.replace("master.flac", "master_clip.mp3");
  it("only a ready row with a clip key and length plays", () => {
    expect(workClipOf({ preview_clip_status: "ready", preview_clip_key: key, preview_clip_seconds: "45.000" })).toEqual({ state: "ready", seconds: 45, key });
    expect(workClipOf({ preview_clip_status: "ready", preview_clip_key: MASTER, preview_clip_seconds: 45 })).toEqual({ state: "pending" });
    expect(workClipOf({ preview_clip_status: "running", preview_clip_key: key, preview_clip_seconds: 45 })).toEqual({ state: "pending" });
    expect(workClipOf({ preview_clip_status: "failed" })).toEqual({ state: "pending" });
    expect(workClipOf(null)).toEqual({ state: "pending" });
  });
  it("queue: new row yes, pending/ready no, failed only after the retry delay", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    expect(shouldQueueWorkClip({ preview_clip_status: null }, now)).toBe(true);
    expect(shouldQueueWorkClip({ preview_clip_status: "pending" }, now)).toBe(false);
    expect(shouldQueueWorkClip({ preview_clip_status: "ready" }, now)).toBe(false);
    expect(shouldQueueWorkClip({ preview_clip_status: "failed", preview_clip_requested_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(shouldQueueWorkClip({ preview_clip_status: "failed", preview_clip_requested_at: new Date(now - WORK_CLIP_RETRY_AFTER_MS).toISOString() }, now)).toBe(true);
  });
});

describe("work clip — source (Free watermark, owner 2026-11-22)", () => {
  const PREVIEW = MASTER.replace(/master\.flac$/, "master_preview.mp3");
  it("paid plans cut a clean clip from the master, preview or not", () => {
    for (const tier of ["BRONZE", "SILVER", "GOLD"] as const) {
      expect(workClipNeedsWatermark(tier)).toBe(false);
      expect(workClipSourceFor({ masterKey: MASTER, tier, previewExists: true })).toEqual({ kind: "clean", key: MASTER });
      expect(workClipSourceFor({ masterKey: MASTER, tier, previewExists: false })).toEqual({ kind: "clean", key: MASTER });
    }
  });
  it("Free cuts from the stored watermarked preview when it exists", () => {
    expect(workClipNeedsWatermark("FREE")).toBe(true);
    expect(workClipSourceFor({ masterKey: MASTER, tier: "FREE", previewExists: true })).toEqual({ kind: "stored_preview", key: PREVIEW });
  });
  it("Free without a preview watermarks the master first — never a clean source", () => {
    expect(workClipSourceFor({ masterKey: MASTER, tier: "FREE", previewExists: false })).toEqual({ kind: "watermark_master", key: MASTER });
  });
  it("unknown plan fails closed like Free", () => {
    expect(workClipNeedsWatermark(null)).toBe(true);
    expect(workClipSourceFor({ masterKey: MASTER, tier: null, previewExists: true }).kind).toBe("stored_preview");
    expect(workClipSourceFor({ masterKey: MASTER, tier: null, previewExists: false }).kind).toBe("watermark_master");
  });
});

describe("work clip — E3 worker wiring", () => {
  const worker = readFileSync("src/lib/studio/master/worker.ts", "utf8");
  const poll = readFileSync("scripts/studio-master-worker-poll.ts", "utf8");
  it("cuts from this work's own approved master folder and completes through the RPC", () => {
    expect(worker).toContain('rpc("claim_next_work_preview_clip"');
    expect(worker).toContain('rpc("complete_work_preview_clip"');
    expect(worker).toContain("masterKey.startsWith(`${prefix}/out/`)");
    expect(worker).toContain("workClipFfmpegArgs(");
  });
  it("reads the owner's plan at the cut and watermarks with the preview recipe", () => {
    expect(worker).toContain("resolveProductEntitlementForUserId(job.owner_id)");
    expect(worker).toContain('throw new Error("plan_lookup")');
    expect(worker).toContain("workClipSourceFor(");
    expect(worker).toContain('source.kind === "watermark_master"');
    // One watermark recipe for the master preview, the Free download and the Free clip.
    expect(worker.match(/previewMixArgs\(/g)?.length).toBe(1);
  });
  it("the poller only cuts clips when no master job waits, and backs off without the migration", () => {
    expect(poll.indexOf("claimNextStudioMasterJob(cfg)")).toBeLessThan(poll.indexOf("claimNextWorkClip(cfg)"));
    expect(poll).toContain("WorkClipQueueUnavailable");
  });
});

describe("work clip — migration", () => {
  const sql = readFileSync("supabase/migrations/20261122140000_work_preview_clip.sql", "utf8");
  it("is additive and service_role only", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/i);
    expect(sql).toMatch(/revoke all on function public\.claim_next_work_preview_clip\(text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.complete_work_preview_clip\([^)]*\) to service_role/);
    expect(sql).toContain("for update of w skip locked");
    expect(sql).toContain("w.withdrawn_at is null");
  });
});

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { CoverModerationOutcome } from "@/lib/beats/cover/cover-decision";

import { processVideoImage, videoImageVerdict, VIDEO_IMAGE_FILTER_DOWN_MESSAGE, VIDEO_IMAGE_REJECTED_MESSAGE, VIDEO_IMAGE_REVIEW_MESSAGE } from "./image";

const outcome = (decision: CoverModerationOutcome["decision"], skippedReason?: "disabled" | "error"): CoverModerationOutcome =>
  ({ provider: skippedReason ? "none" : "gemini", decision, flagged: false, maxScore: 0, topCategory: null, scores: {}, ...(skippedReason ? { skippedReason } : {}) });

describe("video graphic — filter verdict (no moderator queue)", () => {
  it("only approve passes", () => {
    expect(videoImageVerdict(outcome("approve"))).toEqual({ ok: true });
    expect(videoImageVerdict(outcome("reject"))).toEqual({ ok: false, message: VIDEO_IMAGE_REJECTED_MESSAGE });
    expect(videoImageVerdict(outcome("review"))).toEqual({ ok: false, message: VIDEO_IMAGE_REVIEW_MESSAGE });
    expect(videoImageVerdict(outcome("review", "error"))).toEqual({ ok: false, message: VIDEO_IMAGE_FILTER_DOWN_MESSAGE });
  });
});

describe("video graphic — processing keeps the aspect", () => {
  it("wide image stays wide, metadata-free JPEG + small preview", async () => {
    const png = await sharp({ create: { width: 1600, height: 600, channels: 3, background: "#336699" } }).png().toBuffer();
    const r = await processVideoImage(png);
    expect([r.width, r.height]).toEqual([1600, 600]);
    const meta = await sharp(r.image).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(Math.max((await sharp(r.moderationPreview).metadata()).width ?? 0)).toBeLessThanOrEqual(512);
  });
  it("same input checks as covers, with graphic wording", async () => {
    const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(processVideoImage(tiny)).rejects.toThrow("Grafika musi mieć co najmniej 300×300 px.");
    await expect(processVideoImage(new Uint8Array())).rejects.toThrow("Plik grafiki jest pusty.");
  });
});

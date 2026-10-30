import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { BEAT_COVER_FULL_PX, BEAT_COVER_THUMB_PX } from "@/config/beat-covers";
import { processCoverImage } from "@/lib/beats/cover/cover-image";

async function jpegWithExif(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .withExif({ IFD0: { Artist: "secret-person", Copyright: "gps-ish" } })
    .jpeg()
    .toBuffer();
}

describe("cover image processing", () => {
  it("re-encodes to square WebP 1024 + thumb and strips EXIF", async () => {
    const input = await jpegWithExif(1600, 900);
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined();

    const out = await processCoverImage(input);
    const full = await sharp(out.full).metadata();
    const thumb = await sharp(out.thumb).metadata();
    expect(full.format).toBe("webp");
    expect([full.width, full.height]).toEqual([BEAT_COVER_FULL_PX, BEAT_COVER_FULL_PX]);
    expect([thumb.width, thumb.height]).toEqual([BEAT_COVER_THUMB_PX, BEAT_COVER_THUMB_PX]);
    expect(full.exif).toBeUndefined();
    expect(thumb.exif).toBeUndefined();
    expect(out.full.includes(Buffer.from("secret-person"))).toBe(false);
    const preview = await sharp(out.moderationPreview).metadata();
    expect(preview.format).toBe("jpeg");
    expect(preview.exif).toBeUndefined();
  });

  it("rejects too small, non-image and empty input", async () => {
    await expect(processCoverImage(await jpegWithExif(200, 200))).rejects.toThrow(/300×300/);
    await expect(processCoverImage(new TextEncoder().encode("<svg></svg>"))).rejects.toThrow(
      /poprawny obraz/,
    );
    await expect(processCoverImage(new Uint8Array())).rejects.toThrow(/pusty/);
  });
});

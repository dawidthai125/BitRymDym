import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOT_SAMPLE_COPY_TAKE, parseSampleCopyTakeTitle, sampleCopyTakeTitle } from "./sample-policy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("catalog samples cannot be downloaded", () => {
  it("recognises sample-copy takes only by their exact title", () => {
    const id = "7436b665-d2e8-4ab0-b044-0a4692a98452";
    expect(parseSampleCopyTakeTitle(sampleCopyTakeTitle(id))).toBe(id);
    expect(parseSampleCopyTakeTitle(null)).toBeNull();
    expect(parseSampleCopyTakeTitle("Mój wers")).toBeNull();
    expect(parseSampleCopyTakeTitle("smp:nie-uuid")).toBeNull();
    expect(NOT_SAMPLE_COPY_TAKE).toBe("title.is.null,and(title.not.like.smp:*,title.not.like.catalog:*)");
  });

  it("guards take download and export before any file is handed out", () => {
    const download = read("src/lib/takes/take-download.ts");
    expect(download.indexOf("assertTakeIsNotForeignSampleCopy(")).toBeGreaterThan(0);
    expect(download.indexOf("assertTakeIsNotForeignSampleCopy(")).toBeLessThan(download.indexOf("createSignedUrl"));
    const exp = read("src/lib/takes/take-export-service.ts");
    const fn = exp.slice(exp.indexOf("export async function createTakeExportJobFor"));
    expect(fn.indexOf("assertTakeIsNotForeignSampleCopy(")).toBeGreaterThan(0);
    expect(fn.indexOf("assertTakeIsNotForeignSampleCopy(")).toBeLessThan(fn.indexOf("Reuse READY"));
  });

  it("never gives the player a storage URL", () => {
    const play = read("src/app/api/studio/samples/[sampleId]/play/route.ts");
    expect(play).toContain("/api/studio/samples/${sampleId}/stream");
    expect(play).not.toContain("url: result.url");
    const stream = read("src/app/api/studio/samples/[sampleId]/stream/route.ts");
    expect(stream).toContain("no-store");
    expect(stream).toContain('"Content-Disposition": "inline"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { clientAnalysisObject } from "./project-audio";

describe("analysis-audio never hands the browser the clean master", () => {
  const master = { kind: "master" as const, bucket: "audio-artifacts", key: "studio-master/u/p/j/out/master.flac" };
  it("master → the watermarked preview MP3, same bucket", () => {
    expect(clientAnalysisObject(master)).toEqual({ bucket: "audio-artifacts", key: "studio-master/u/p/j/out/master_preview.mp3" });
  });
  it("master with an unexpected key → null (fail closed, no clean fallback)", () => {
    expect(clientAnalysisObject({ ...master, key: "studio-master/u/p/j/out/master.flac.part1" })).toBeNull();
    expect(clientAnalysisObject({ ...master, key: "studio-master/u/p/j/out/transcode.mp3" })).toBeNull();
  });
  it("beat (no master yet) → never the full file; the route swaps in the 20 s PREVIEW asset", () => {
    const beat = { kind: "beat" as const, bucket: "beat-audio", key: "k", beatId: "b" };
    expect(clientAnalysisObject(beat)).toBeNull();
    const src = readFileSync("src/lib/studio/analysis/project-audio.ts", "utf8");
    expect(src).toContain('.eq("purpose", "PREVIEW")');
    expect(src).toContain("previewBeatObjectKey(admin, source.beatId)");
  });
  it("separator: only an approved master is split, never the Bit alone", () => {
    const sep = readFileSync("src/lib/studio/separate/separate-server.ts", "utf8");
    expect(sep).toContain('source.kind !== "master"');
  });
  it("the route signs only what clientAnalysisObject returns", () => {
    const src = readFileSync("src/lib/studio/analysis/project-audio.ts", "utf8");
    expect(src).toContain("let target = clientAnalysisObject(source);");
    expect(src).toContain("createSignedUrl(target.key, SIGNED_SECONDS)");
  });
});

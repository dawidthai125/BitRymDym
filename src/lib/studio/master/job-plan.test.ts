import { describe, expect, it } from "vitest";

import { outputExt, planStudioMasterJob, studioMasterJobPrefix } from "./job-plan";
import { decideStudioMasterWorkerConfig } from "./worker-env";

const U = "11111111-2222-4333-8444-555555555555";

describe("studio master job plan", () => {
  it("master → python then ffmpeg/copy", () => {
    expect(planStudioMasterJob({ kind: "master", target: "club", settings: { bass: 1 }, output_format: "MP3_320" }).map((s) => s.op)).toEqual(["python_master", "ffmpeg"]);
    expect(planStudioMasterJob({ kind: "master", target: "streaming", settings: {}, output_format: "WAV_FLOAT" }).map((s) => s.op)).toEqual(["python_master", "copy"]);
    expect(() => planStudioMasterJob({ kind: "master", target: null, settings: {}, output_format: "WAV_24" })).toThrow("missing_target");
  });
  it("raw/transcode never touch the master chain; project is zip only", () => {
    const raw = planStudioMasterJob({ kind: "raw_sum", target: null, settings: {}, output_format: "WAV_24" });
    expect(raw).toEqual([{ op: "ffmpeg", args: ["-c:a", "pcm_s24le", "-ar", "48000"] }]);
    expect(planStudioMasterJob({ kind: "project_zip", target: null, settings: {}, output_format: "ZIP" })).toEqual([{ op: "python_zip" }]);
    expect(() => planStudioMasterJob({ kind: "project_zip", target: null, settings: {}, output_format: "MP3_128" })).toThrow();
  });
  it("youtube_video is MP4 only, MP4 only for youtube_video", () => {
    expect(planStudioMasterJob({ kind: "youtube_video", target: null, settings: {}, output_format: "MP4" })).toEqual([{ op: "youtube_video" }]);
    expect(() => planStudioMasterJob({ kind: "youtube_video", target: null, settings: {}, output_format: "MP3_320" })).toThrow("bad_format");
    expect(() => planStudioMasterJob({ kind: "transcode", target: null, settings: {}, output_format: "MP4" })).toThrow("bad_format");
    expect(outputExt("MP4")).toBe("mp4");
  });
  it("prefix only from uuids", () => {
    expect(studioMasterJobPrefix(U, U, U)).toBe(`studio-master/${U}/${U}/${U}`);
    expect(() => studioMasterJobPrefix("../x", U, U)).toThrow("bad_id");
  });
  it("kill switch", () => {
    expect(decideStudioMasterWorkerConfig({}, 1).action).toBe("exit_disabled");
    const c = decideStudioMasterWorkerConfig({ STUDIO_MASTER_ENABLED: "true", STUDIO_MASTER_POLL_MS: "5" }, 7);
    expect(c).toMatchObject({ action: "run", workerRef: "studio-master-7", pollMs: 4000 });
  });
});

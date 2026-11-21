import { describe, expect, it } from "vitest";

import { trimStudioExportTimeline } from "@/lib/audio/studio-export-document-snapshot";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { studioExportForbiddenMessage } from "@/lib/studio/studio-export-client";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

function doc(timelineLengthMs: number, clipEnds: Array<[number, number]>): StudioProjectDocument {
  return {
    project: { id: "p", timelineLengthMs, documentVersion: 1 },
    tracks: [],
    clips: clipEnds.map(([start, dur], i) => ({ id: `c${i}`, timelineStartMs: start, durationMs: dur })),
  } as unknown as StudioProjectDocument;
}

describe("trimStudioExportTimeline (prod 2026-11-21: 6:00 canvas vs 3:00 export cap)", () => {
  it("renders up to the end of the last clip, not the empty canvas", () => {
    const out = trimStudioExportTimeline(doc(360_000, [[0, 150_000], [10_000, 43_000]]));
    expect(out.project.timelineLengthMs).toBe(150_000);
  });
  it("keeps an empty or already short project unchanged", () => {
    const empty = doc(360_000, []);
    expect(trimStudioExportTimeline(empty)).toBe(empty);
    const short = doc(60_000, [[0, 30_000]]);
    expect(trimStudioExportTimeline(short).project.timelineLengthMs).toBe(30_000);
  });
  it("fails fast with a marked LIMIT when the song plus FX tail exceeds the cap", () => {
    try {
      trimStudioExportTimeline(doc(360_000, [[0, 200_000]]));
      throw new Error("expected LIMIT");
    } catch (e) {
      expect(e).toBeInstanceOf(RenderJobDomainError);
      expect((e as RenderJobDomainError).code).toBe("LIMIT");
      expect((e as Error).message).toMatch(/EXPORT_DURATION_CAP/);
    }
  });
});

describe("studioExportForbiddenMessage", () => {
  it("explains an expired take instead of 'no permission'", () => {
    expect(studioExportForbiddenMessage("Take session expired.")).toMatch(/wygasło/);
    expect(studioExportForbiddenMessage("Take was deleted.")).toMatch(/usunięte/);
    expect(studioExportForbiddenMessage("Forbidden.")).toBe("Brak uprawnień do eksportu tego projektu.");
  });
});

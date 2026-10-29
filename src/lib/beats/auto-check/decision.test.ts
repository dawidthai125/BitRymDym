import { describe, expect, it } from "vitest";

import { AUTO_CHECK_MESSAGES_PL, decideAutoCheck } from "@/lib/beats/auto-check/decision";
import type { RecognitionProviderResult, VocalResult } from "@/lib/beats/auto-check/types";

const own = (over: Partial<RecognitionProviderResult> = {}): RecognitionProviderResult => ({
  provider: "own_catalog", required: true, outcome: "no_match", matches: [], ...over,
});
const acoustid = (over: Partial<RecognitionProviderResult> = {}): RecognitionProviderResult => ({
  provider: "acoustid", required: false, outcome: "no_match", matches: [], ...over,
});
const vocal = (over: Partial<VocalResult> = {}): VocalResult => ({
  outcome: "ok", method: "demucs-htdemucs", ratio: 0, windows: [], prescreenScore: 0.05, ...over,
});

describe("decideAutoCheck", () => {
  it("passes a clean instrumental when own catalog + vocals ran", () => {
    const v = decideAutoCheck({ recognition: [own(), acoustid()], vocal: vocal() });
    expect(v.status).toBe("passed");
    expect(v.summaryPl).toBe(AUTO_CHECK_MESSAGES_PL.passed);
  });

  it("passes with AcoustID not configured (own catalog alone suffices)", () => {
    const v = decideAutoCheck({ recognition: [own(), acoustid({ outcome: "not_configured" })], vocal: vocal() });
    expect(v.status).toBe("passed");
  });

  it("zero tolerance: 2 vocal windows reject", () => {
    const v = decideAutoCheck({
      recognition: [own()],
      vocal: vocal({ ratio: 0.011, windows: [{ startSeconds: 10, endSeconds: 11, db: -20 }, { startSeconds: 40, endSeconds: 41, db: -22 }] }),
    });
    expect(v.status).toBe("rejected_vocals");
  });

  it("a single 1 s bleed window below 2 % does not reject", () => {
    const v = decideAutoCheck({
      recognition: [own()],
      vocal: vocal({ ratio: 0.006, windows: [{ startSeconds: 10, endSeconds: 11, db: -28 }] }),
    });
    expect(v.status).toBe("passed");
  });

  it("strong pre-screen rejects even if separation failed", () => {
    const v = decideAutoCheck({ recognition: [own()], vocal: vocal({ outcome: "error", ratio: null, prescreenScore: 0.93 }) });
    expect(v.status).toBe("rejected_vocals");
  });

  it("own-catalog hard match rejects; weak or short match does not", () => {
    const hard = decideAutoCheck({ recognition: [own({ outcome: "match", matches: [{ provider: "own_catalog", score: 0.9, matchedSeconds: 60 }] })], vocal: vocal() });
    expect(hard.status).toBe("rejected_match");
    const short = decideAutoCheck({ recognition: [own({ outcome: "match", matches: [{ provider: "own_catalog", score: 0.95, matchedSeconds: 5 }] })], vocal: vocal() });
    expect(short.status).toBe("passed");
    const weak = decideAutoCheck({ recognition: [own({ outcome: "match", matches: [{ provider: "own_catalog", score: 0.7, matchedSeconds: 60 }] })], vocal: vocal() });
    expect(weak.status).toBe("passed");
  });

  it("AcoustID score >= 0.9 rejects", () => {
    const v = decideAutoCheck({ recognition: [own(), acoustid({ outcome: "match", matches: [{ provider: "acoustid", score: 0.95, matchedSeconds: null, title: "X" }] })], vocal: vocal() });
    expect(v.status).toBe("rejected_match");
    expect(v.recognitionScore).toBe(0.95);
  });

  it("never passes without own-catalog matching (needs_config)", () => {
    expect(decideAutoCheck({ recognition: [acoustid()], vocal: vocal() })).toMatchObject({ status: "error", errorCode: "needs_config" });
    expect(decideAutoCheck({ recognition: [own({ outcome: "not_configured" })], vocal: vocal() })).toMatchObject({ status: "error", errorCode: "needs_config" });
  });

  it("never passes without vocal separation", () => {
    expect(decideAutoCheck({ recognition: [own()], vocal: vocal({ outcome: "not_configured", ratio: null }) })).toMatchObject({ status: "error", errorCode: "needs_config" });
    expect(decideAutoCheck({ recognition: [own()], vocal: vocal({ outcome: "timeout", ratio: null, prescreenScore: null }) })).toMatchObject({ status: "error", errorCode: "timeout" });
  });

  it("provider error → error (stays pending), not pass", () => {
    const v = decideAutoCheck({ recognition: [own({ outcome: "error", errorCode: "fpcalc_failed" })], vocal: vocal() });
    expect(v.status).toBe("error");
    expect(v.errorCode).toBe("fpcalc_failed");
    expect(v.summaryPl).toBe(AUTO_CHECK_MESSAGES_PL.error);
  });

  it("optional provider error does not block pass", () => {
    const v = decideAutoCheck({ recognition: [own(), acoustid({ outcome: "error" })], vocal: vocal() });
    expect(v.status).toBe("passed");
  });
});

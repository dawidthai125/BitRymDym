import { describe, expect, it } from "vitest";

import { keyFromBrief, pickWinner, type AutoCandidate } from "./auto-beat-client";
import { autoRevisionNote, combineVerdict, needsAutoRevision, parseJudgeRun } from "./beat-judge";
import { normalizeStableAudioSampling, randomStableAudioSeed, STABLE_AUDIO_SEED_MAX } from "./stability";

const run = (overall: number, bass = 5) =>
  parseJudgeRun(JSON.stringify({ overall, scores: { tempo: 7, bass }, same: ["boom bap"], different: ["bas"], fix: "More active bass." }))!;

describe("beat judge", () => {
  it("reads nested and flat score shapes, rejects junk", () => {
    expect(run(6).scores.bass).toBe(5);
    expect(parseJudgeRun(JSON.stringify({ overall: 7, tempo: 8, bass: 6, same: [], different: [], fix: "" }))!.scores.tempo).toBe(8);
    expect(parseJudgeRun("not json")).toBeNull();
    expect(parseJudgeRun(JSON.stringify({ overall: 42 }))).toBeNull();
  });

  it("averages two runs and penalises a measured key miss", () => {
    const ok = combineVerdict([run(6), run(7)], { measured: "Dm", target: "Dm" })!;
    expect(ok.geminiOverall).toBe(6.5);
    expect(ok.keyOk).toBe(true);
    expect(ok.score).toBe(6.5);
    const rel = combineVerdict([run(6)], { measured: "F", target: "Dm" })!;
    expect(rel.keyOk).toBe(true); // relative major counts as the same key
    const miss = combineVerdict([run(7)], { measured: "Am", target: "Dm" })!;
    expect(miss.keyOk).toBe(false);
    expect(miss.score).toBe(5.5);
    expect(combineVerdict([], { measured: null, target: null })).toBeNull();
  });

  it("asks for a revision when weak or off-key, and says why", () => {
    const weak = combineVerdict([run(6)], { measured: "Am", target: "Dm" })!;
    expect(needsAutoRevision(weak)).toBe(true);
    const note = autoRevisionNote(weak);
    expect(note).toContain("Am zamiast Dm");
    expect(note).toContain("bass");
    expect(note).toContain("9/10");
    expect(needsAutoRevision(combineVerdict([run(8, 8)], { measured: "Dm", target: "Dm" })!)).toBe(false);
  });

  it("picks the best judged variant", () => {
    const c = (label: string, score: number | null): AutoCandidate => ({
      label, beatId: label, title: label, seed: 1, cfgScale: null, description: "", bpm: 92,
      verdict: score == null ? null : combineVerdict([run(score)], { measured: null, target: null }),
    });
    expect(pickWinner([c("A", 6), c("B", 7)]).label).toBe("B");
    expect(pickWinner([c("A", 6), c("B", null)]).label).toBe("A");
    expect(pickWinner([c("A", null), c("B", null)]).label).toBe("A");
  });

  it("reads the key from a brief", () => {
    expect(keyFromBrief("92 BPM. Key: D minor. Punchy")).toBe("Dm");
    expect(keyFromBrief("Key: F# major.")).toBe("F#");
    expect(keyFromBrief("no key here")).toBeNull();
  });
});

describe("stable audio sampling", () => {
  it("keeps valid seed and cfg, drops the rest", () => {
    expect(normalizeStableAudioSampling(123, 4)).toEqual({ seed: 123, cfgScale: 4 });
    expect(normalizeStableAudioSampling(0, 30)).toEqual({ seed: null, cfgScale: null });
    expect(normalizeStableAudioSampling("5", null)).toEqual({ seed: null, cfgScale: null });
    const s = randomStableAudioSeed();
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThanOrEqual(STABLE_AUDIO_SEED_MAX);
  });
});

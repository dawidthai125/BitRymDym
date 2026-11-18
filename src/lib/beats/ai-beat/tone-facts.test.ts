import { describe, expect, it } from "vitest";

import { bitekFactsLines } from "@/lib/beats/ai-beat/bitek-review";
import { dynamicSpread, measureToneFacts, toneFactLines } from "@/lib/beats/ai-beat/tone-facts";

const FS = 44100;

function sine(freq: number, amp: number, seconds = 4): Float32Array {
  const out = new Float32Array(FS * seconds);
  for (let i = 0; i < out.length; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / FS);
  return out;
}

describe("measureToneFacts", () => {
  it("reports a bass-only file as low-heavy with no top end", () => {
    const tone = measureToneFacts(sine(60, 0.5), FS);
    expect(tone).not.toBeNull();
    expect(tone!.lowSharePct).toBeGreaterThan(90);
    expect(tone!.highSharePct).toBeLessThan(2);
  });

  it("returns null for a clip shorter than a second", () => {
    expect(measureToneFacts(sine(440, 0.5, 0.2), FS)).toBeNull();
  });

  it("measures the spread between quiet and loud parts", () => {
    const loud = sine(300, 0.5, 4);
    const quiet = sine(300, 0.02, 4);
    const both = new Float32Array(loud.length + quiet.length);
    both.set(loud, 0);
    both.set(quiet, loud.length);
    const spread = dynamicSpread(both, FS);
    expect(spread.loudDb - spread.quietDb).toBeGreaterThan(20);
  });
});

describe("Bitek facts", () => {
  const base = {
    title: "Test",
    style: "trap",
    opis: "Hard kick and a guitar riff.",
    bpm: 80,
    durationSeconds: 150,
    peakDb: -0.4,
    rmsDb: -16,
  };

  it("labels the order as a request, not as how the file sounds", () => {
    const text = bitekFactsLines(base).join("\n");
    expect(text).toContain("prośba, nie potwierdzenie brzmienia");
  });

  it("adds measurements, or says they are unavailable", () => {
    const withTone = bitekFactsLines({
      ...base,
      tone: { lowSharePct: 63, highSharePct: 7, quietDb: -37, loudDb: -14, key: "Dm", keyConfidence: 0.6 },
    }).join("\n");
    expect(withTone).toContain("poniżej 150 Hz 63%");
    expect(withTone).toContain("Tonacja z analizy: Dm");
    expect(bitekFactsLines(base).join("\n")).toContain("niedostępny");
    expect(toneFactLines({ lowSharePct: 1, highSharePct: 1, quietDb: -1, loudDb: -1, key: null, keyConfidence: null }).join(" ")).toContain("niepewna");
  });
});

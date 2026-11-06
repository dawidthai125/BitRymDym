import { describe, expect, it } from "vitest";

import { BitekProviderError, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";

import { AI_LYRICS_MAX_REPAIRS, validateAiLyricsInput, type AiLyricsInput } from "./ai-lyrics";
import { runLyricsPipeline } from "./ai-lyrics-pipeline";

const GOOD = "[Zwrotka 1]\nRano kawa stygnie, miasto wraca do biegu,\nja wciąż liczę kroki po nocnym śniegu.\nW kieszeni drobne, w głowie ciężki plan,\ndziś zrobię z niego własny, pewny stan.";
const BAD = "[Zwrotka 1]\nCienie w metrze, dźwięk kroków\nMiasto śpiewa, a serce szuka\nNocna zmiana, w kieszeni myśli\nSkręcamy ulicami";

const input = (): AiLyricsInput => {
  const r = validateAiLyricsInput("keywords", "nocna zmiana, miasto", "rap", 92);
  if (!r.ok) throw new Error("bad input");
  return r;
};

function provider(id: "groq" | "gemini", answers: (string | Error)[], seen: string[] = []): BitekLlmProvider {
  let n = 0;
  return {
    id,
    model: `${id}-m`,
    timeoutMs: 1000,
    async complete(messages) {
      seen.push(messages.map((m) => m.content).join("\n"));
      const a = answers[Math.min(n++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return a.startsWith("RAW:") ? a.slice(4) : JSON.stringify({ text: a });
    },
  };
}

describe("lyrics pipeline", () => {
  it("returns a well-rhymed first draft without a repair", async () => {
    const r = await runLyricsPipeline({ providers: [provider("groq", [GOOD])], input: input() });
    expect(r).toMatchObject({ text: GOOD, provider: "groq", model: "groq-m", repairs: 0, rhyme: 1 });
  });

  it("repairs a badly rhymed draft and sends the weak lines back", async () => {
    const seen: string[] = [];
    const r = await runLyricsPipeline({ providers: [provider("groq", [BAD, GOOD], seen)], input: input() });
    expect(r?.text).toBe(GOOD);
    expect(r?.repairs).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain("nie rymują się");
    expect(seen[1]).toContain("Skręcamy ulicami");
  });

  it("keeps the best draft when a repair is worse, and stops after the repair limit", async () => {
    const worse = "[Zwrotka 1]\nraz dwa trzy cztery\npięć sześć siedem osiem\ndziewięć dziesięć jedenaście\ndwanaście trzynaście";
    const seen: string[] = [];
    const r = await runLyricsPipeline({ providers: [provider("groq", [BAD, worse, worse], seen)], input: input() });
    expect(seen.length).toBe(1 + AI_LYRICS_MAX_REPAIRS);
    expect(r?.repairs).toBe(AI_LYRICS_MAX_REPAIRS);
    expect(r?.rhyme).toBeGreaterThanOrEqual(0);
    expect([BAD, worse]).toContain(r?.text);
  });

  it("falls back to the next provider when the first fails", async () => {
    const r = await runLyricsPipeline({
      providers: [provider("groq", [new BitekProviderError("server", 500)]), provider("gemini", [GOOD])],
      input: input(),
    });
    expect(r).toMatchObject({ provider: "gemini", repairs: 0 });
  });

  it("returns null when every provider fails or answers with junk", async () => {
    const r = await runLyricsPipeline({
      providers: [provider("groq", [new BitekProviderError("timeout")]), provider("gemini", ["RAW:{not json"])],
      input: input(),
    });
    expect(r).toBeNull();
  });

  it("skips repairs after the deadline", async () => {
    const seen: string[] = [];
    const r = await runLyricsPipeline({ providers: [provider("groq", [BAD, GOOD], seen)], input: input(), repairDeadline: 1, now: () => 2 });
    expect(r?.text).toBe(BAD);
    expect(r?.repairs).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it("puts the style and the tempo in the prompt", async () => {
    const seen: string[] = [];
    await runLyricsPipeline({ providers: [provider("groq", [GOOD], seen)], input: input() });
    expect(seen[0]).toContain("92 BPM");
    expect(seen[0]).toContain("klasyczny rap");
  });
});

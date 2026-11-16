import { describe, expect, it } from "vitest";

import {
  DEFAULT_BEAT_DURATION,
  descriptionFromYoutubeStyle,
  fallbackEnglishPrompt,
  normalizeBeatDescription,
  normalizeBeatDuration,
  normalizeBeatHintBpm,
  parseBeatRewrite,
  pickGeneratedBpm,
  preservedEnglishPrompt,
  stripStyleOfNamedArtist,
  withInstrumentalClause,
} from "@/lib/beats/ai-beat/prompt";

describe("beat generator prompt", () => {
  it("accepts the four beat lengths and rejects the rest", () => {
    expect(normalizeBeatDuration(DEFAULT_BEAT_DURATION)).toBe(150);
    expect(normalizeBeatDuration(90)).toBe(90);
    expect(normalizeBeatDuration(200)).toBeNull();
    expect(normalizeBeatDuration("180")).toBe(180);
  });

  it("keeps a real description and drops a short one", () => {
    expect(normalizeBeatDescription("  ciemny   bit na noc  ")).toBe("ciemny bit na noc");
    expect(normalizeBeatDescription("krotki")).toBeNull();
  });

  it("prefers the English YouTube prompt for Stable Audio", () => {
    expect(
      descriptionFromYoutubeStyle({
        style: "ciemny boom bap",
        opis: "Wolne werble i głębokie 808. Piano zostawia miejsce na zwrotkę.",
        prompt:
          "Soft kick, snappy snare, deep 808, sparse minor piano, room for a verse.",
      }),
    ).toBe(
      "Soft kick, snappy snare, deep 808, sparse minor piano, room for a verse.",
    );
    expect(
      descriptionFromYoutubeStyle({
        style: "ciemny boom bap",
        opis: "Wolne werble i głębokie 808. Piano zostawia miejsce na zwrotkę.",
      }),
    ).toBe(
      "ciemny boom bap. Wolne werble i głębokie 808. Piano zostawia miejsce na zwrotkę.",
    );
  });

  it("keeps an English description as the Stable Audio prompt", () => {
    const prompt = preservedEnglishPrompt(
      "Soft kick, snappy snare, deep 808, sparse minor piano.",
      92,
    );
    expect(prompt).toContain("Soft kick");
    expect(prompt).toContain("92 BPM");
    expect(prompt.toLowerCase()).toContain("no vocals");
  });

  it("treats an empty tempo as optional and rejects a tempo outside 60–180", () => {
    expect(normalizeBeatHintBpm("")).toBeNull();
    expect(normalizeBeatHintBpm(90)).toBe(90);
    expect(normalizeBeatHintBpm(40)).toBe("invalid");
    expect(normalizeBeatHintBpm(90.5)).toBe("invalid");
  });

  it("forces an instrumental hip-hop prompt and drops a named style", () => {
    const cleaned = stripStyleOfNamedArtist(
      "Dark piano loop in the style of a famous rapper, slow 808.",
    );
    expect(cleaned.toLowerCase()).not.toContain("famous");
    const prompt = withInstrumentalClause("A roomy drum loop.");
    expect(prompt.toLowerCase()).toContain("no vocals");
    expect(prompt.toLowerCase()).toContain("hip-hop");
    const fallback = fallbackEnglishPrompt("night drive", 86);
    expect(fallback).toContain("86 BPM");
    expect(fallback.toLowerCase()).toContain("no vocals");
  });

  it("reads the model JSON and ignores a fenced extra", () => {
    const parsed = parseBeatRewrite(
      '```json\n{"title":"Nocny dach","prompt":"Sparse drums and a minor piano."}\n```',
    );
    expect(parsed?.title).toBe("Nocny dach");
    expect(parsed?.prompt.toLowerCase()).toContain("no vocals");
  });

  it("reads Polish style and opis when the model sends them", () => {
    const parsed = parseBeatRewrite(
      '{"title":"Nocny dach","prompt":"Sparse drums and a minor piano.","style":"  ciemny boom bap  ","opis":"  Ciemny nastrój, twarde bębny, niski bas i prosta melodia.  "}',
    );
    expect(parsed?.title).toBe("Nocny dach");
    expect(parsed?.style).toBe("ciemny boom bap");
    expect(parsed?.opis).toBe("Ciemny nastrój, twarde bębny, niski bas i prosta melodia.");
    expect(parsed?.prompt.toLowerCase()).toContain("no vocals");
  });

  it("accepts title and prompt when style and opis are absent", () => {
    const parsed = parseBeatRewrite(
      '{"title":"Nocny dach","prompt":"Sparse drums and a minor piano."}',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.style).toBeNull();
    expect(parsed?.opis).toBeNull();
    expect(parsed?.prompt.toLowerCase()).toContain("no vocals");
  });

  it("saves a sure tempo automatically and a typed tempo as a candidate", () => {
    const sure = pickGeneratedBpm(
      {
        decision: "AUTO_SUGGEST",
        detectedBpm: 92,
        allowlist: [92],
        requiresExplicitSelection: false,
        confidenceClass: "HIGH",
      },
      null,
    );
    expect(sure).toEqual({ bpm: 92, mode: "AUTO" });

    const hinted = pickGeneratedBpm(
      {
        decision: "MANUAL_REQUIRED",
        detectedBpm: 80,
        allowlist: [80, 160],
        requiresExplicitSelection: true,
        confidenceClass: "CONFLICT",
      },
      160,
    );
    expect(hinted).toEqual({ bpm: 160, mode: "CANDIDATE" });
  });

  it("returns no tempo when the file has no allowed value", () => {
    expect(
      pickGeneratedBpm(
        {
          decision: "UNAVAILABLE",
          detectedBpm: null,
          allowlist: [],
          requiresExplicitSelection: true,
          confidenceClass: "UNAVAILABLE",
        },
        90,
      ),
    ).toBeNull();
  });
});

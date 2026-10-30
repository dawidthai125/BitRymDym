import { describe, expect, it, vi } from "vitest";

import { coverOutcomeFromGemini, moderateCoverImage } from "./cover-moderation";

const ZERO = {
  flagged: false,
  sexual: 0.01,
  sexual_minors: 0,
  violence: 0.02,
  violence_graphic: 0,
  hate: 0,
  self_harm: 0,
  self_harm_instructions: 0,
  drugs: 0.01,
};
const reply = (obj: unknown, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(obj) }] } }],
});
const KEY = { GEMINI_API_KEY: "test-key" };
const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function okFetch(body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("cover moderation — Gemini response → decision", () => {
  it("harmless cover → approve with all categories scored", () => {
    const o = coverOutcomeFromGemini(reply(ZERO));
    expect(o.provider).toBe("gemini");
    expect(o.decision).toBe("approve");
    expect(Object.keys(o.scores).sort()).toEqual(
      ["drugs", "hate", "self-harm", "self-harm/instructions", "sexual", "sexual/minors", "violence", "violence/graphic"],
    );
  });

  it("same thresholds: 0.3 → review, 0.8 → reject, strict 0.3 → reject, flagged → review", () => {
    expect(coverOutcomeFromGemini(reply({ ...ZERO, drugs: 0.35 })).decision).toBe("review");
    expect(coverOutcomeFromGemini(reply({ ...ZERO, sexual: 0.85 })).decision).toBe("reject");
    expect(coverOutcomeFromGemini(reply({ ...ZERO, violence_graphic: 0.3 })).decision).toBe("reject");
    expect(coverOutcomeFromGemini(reply({ ...ZERO, flagged: true })).decision).toBe("review");
  });

  it("Gemini safety block (prompt or candidate) → reject", () => {
    for (const r of [
      { promptFeedback: { blockReason: "SAFETY" } },
      { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } },
      { candidates: [{ finishReason: "SAFETY" }] },
      { candidates: [{ finishReason: "IMAGE_SAFETY" }] },
    ]) {
      const o = coverOutcomeFromGemini(r);
      expect(o.decision).toBe("reject");
      expect(o.provider).toBe("gemini");
    }
  });

  it("unusable answer (no JSON, missing score, unrelated block) → moderator queue", () => {
    expect(coverOutcomeFromGemini({ candidates: [{ content: { parts: [{ text: "nope" }] } }] }).decision).toBe("review");
    const missing: Record<string, unknown> = { ...ZERO };
    delete missing.drugs;
    expect(coverOutcomeFromGemini(reply(missing)).skippedReason).toBe("error");
    expect(coverOutcomeFromGemini({ promptFeedback: { blockReason: "OTHER" } }).skippedReason).toBe("error");
    expect(coverOutcomeFromGemini({}).decision).toBe("review");
  });

  it("clamps scores to 0–1", () => {
    expect(coverOutcomeFromGemini(reply({ ...ZERO, hate: -2 })).scores.hate).toBe(0);
  });
});

describe("cover moderation — request + fallbacks", () => {
  it("calls Gemini generateContent with image, JSON schema, temperature 0; key only in header", async () => {
    const { fn, calls } = okFetch(reply(ZERO));
    const o = await moderateCoverImage(IMG, { env: KEY, fetchFn: fn });
    expect(o.decision).toBe("approve");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(calls[0]!.url).not.toContain("test-key");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toContain("self_harm");
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: "image/jpeg", data: IMG.toString("base64") });
  });

  it("BEAT_COVER_GEMINI_MODEL overrides the model", async () => {
    const { fn, calls } = okFetch(reply(ZERO));
    await moderateCoverImage(IMG, { env: { ...KEY, BEAT_COVER_GEMINI_MODEL: "gemini-x" }, fetchFn: fn });
    expect(calls[0]!.url).toContain("/models/gemini-x:generateContent");
  });

  it("no key or kill switch → no call, moderator queue", async () => {
    const { fn, calls } = okFetch(reply(ZERO));
    expect((await moderateCoverImage(IMG, { env: {}, fetchFn: fn })).skippedReason).toBe("disabled");
    expect((await moderateCoverImage(IMG, { env: { ...KEY, BEAT_COVER_AI_MODERATION: "0" }, fetchFn: fn })).decision).toBe("review");
    expect(calls).toHaveLength(0);
  });

  it("HTTP error or network failure → moderator queue, never approve", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const http500 = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    for (const f of [http500, boom]) {
      const o = await moderateCoverImage(IMG, { env: KEY, fetchFn: f });
      expect(o.decision).toBe("review");
      expect(o.provider).toBe("none");
    }
    expect(err.mock.calls.flat().join(" ")).not.toContain("test-key");
    err.mockRestore();
  });
});

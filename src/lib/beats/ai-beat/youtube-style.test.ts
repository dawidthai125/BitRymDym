import { describe, expect, it, vi } from "vitest";

import { BeatRequestError } from "@/lib/beats/request-error";
import {
  composeProducerOpis,
  hipHopGuard,
  describeBeatStyleFromYouTube,
  parseYouTubeWatchUrl,
} from "@/lib/beats/ai-beat/youtube-style";

const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("parseYouTubeWatchUrl", () => {
  it("keeps a public watch, short and mobile link as a bare watch URL", () => {
    expect(parseYouTubeWatchUrl(`https://www.youtube.com/watch?v=${ID}&list=PL123&t=12s`)).toBe(CANONICAL);
    expect(parseYouTubeWatchUrl(`http://youtube.com/watch?v=${ID}`)).toBe(CANONICAL);
    expect(parseYouTubeWatchUrl(`https://m.youtube.com/watch?v=${ID}`)).toBe(CANONICAL);
    expect(parseYouTubeWatchUrl(`https://youtu.be/${ID}?si=abc`)).toBe(CANONICAL);
    expect(parseYouTubeWatchUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(CANONICAL);
  });

  it("rejects other players, playlists and broken ids", () => {
    expect(parseYouTubeWatchUrl("https://soundcloud.com/artist/beat")).toBeNull();
    expect(parseYouTubeWatchUrl("https://open.spotify.com/track/abc")).toBeNull();
    expect(parseYouTubeWatchUrl("https://www.beatstars.com/beat/x")).toBeNull();
    expect(parseYouTubeWatchUrl("https://www.youtube.com/playlist?list=PL123")).toBeNull();
    expect(parseYouTubeWatchUrl("https://www.youtube.com/@channel")).toBeNull();
    expect(parseYouTubeWatchUrl("https://music.youtube.com/watch?v=" + ID)).toBeNull();
    expect(parseYouTubeWatchUrl("javascript:alert(1)")).toBeNull();
    expect(parseYouTubeWatchUrl("")).toBeNull();
    expect(parseYouTubeWatchUrl(null)).toBeNull();
    expect(parseYouTubeWatchUrl(`https://youtu.be/${ID.slice(0, 10)}`)).toBeNull();
    expect(parseYouTubeWatchUrl(`https://youtu.be/${ID}x`)).toBeNull();
  });
});

describe("composeProducerOpis", () => {
  it("joins structured producer fields into one brief", () => {
    const brief = composeProducerOpis({
      drums: "Soft kick and snappy snare with light swing.",
      bass: "Deep long 808 notes.",
      melody: "Sparse minor piano motif.",
      mood: "Dark calm night mood.",
      arrangement: "Loop with room for a verse.",
    });
    expect(brief).toContain("snappy snare");
    expect(brief).toContain("808");
    expect(brief).toContain("piano");
    expect(brief).toContain("verse");
  });

  it("falls back to legacy opis when fields are missing", () => {
    expect(
      composeProducerOpis({
        opis: "Soft drums, deep 808 and short piano.",
      }),
    ).toContain("808");
  });
});

describe("describeBeatStyleFromYouTube", () => {
  const payload = {
    output_text: JSON.stringify({
      style: "ciemny boom bap",
      opis: "Wolne werble, głębokie 808 i krótkie piano. Zostawia miejsce na zwrotkę.",
      drums: "Soft kick and snappy snare with light swing.",
      bass: "Deep long 808 notes under the pocket.",
      melody: "Sparse minor piano motif with air.",
      mood: "Dark calm night mood.",
      arrangement: "Loop with clear room for a rapper verse.",
      bpm: 97,
    }),
  };

  function mockFetch(body: unknown, status = 200) {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    return fetchFn;
  }

  it("asks Gemini with the canonical link and returns English prompt", async () => {
    const fetchFn = mockFetch(payload);
    const described = await describeBeatStyleFromYouTube(
      `https://youtu.be/${ID}?t=4`,
      { skipAuth: true, env: { GEMINI_API_KEY: "test-key" }, fetchFn },
    );
    expect(described.style).toBe("ciemny boom bap");
    expect(described.bpmHint).toBe(97);
    expect(described.opis).toContain("werble");
    expect(described.prompt).toContain("snappy snare");
    expect(described.prompt).toContain("808");
    expect(described.prompt).toContain("piano");
    expect(described.prompt).toContain("rapper verse");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(calledUrl).not.toContain("youtube");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(String(init.body)) as {
      model: string;
      input: Array<{ uri?: string; text?: string }>;
      response_format?: { schema?: { required?: string[] } };
    };
    expect(sent.model).toBe("gemini-3-flash-preview");
    expect(sent.input[0]?.uri).toBe(CANONICAL);
    const instruction = sent.input[1]?.text ?? "";
    expect(instruction).toContain("Stable Audio");
    expect(instruction).toContain("BAD (too vague)");
    expect(instruction).toContain("700 characters");
    expect(instruction).toContain("GOOD:");
    expect(instruction).toContain("concrete sonic detail");
    expect(instruction).toContain("pocket");
    expect(sent.response_format?.schema?.required).toEqual(
      expect.arrayContaining(["opis", "drums", "bass", "melody", "mood", "arrangement"]),
    );
    expect(String(init.body)).not.toContain("base64");
  });

  it("uses BEAT_STYLE_GEMINI_MODEL and reads fenced legacy JSON", async () => {
    const fetchFn = mockFetch({
      outputs: [{ text: "```json\n{\"style\":\"lofi noc\",\"opis\":\"Ciche bebny i cieply bas przez caly loop.\",\"bpm\":\"40\"}\n```" }],
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k", BEAT_STYLE_GEMINI_MODEL: "gemini-x" },
      fetchFn,
    });
    expect(described.style).toBe("lofi noc");
    expect(described.opis).toContain("Ciche bebny");
    expect(described.prompt).toContain("Ciche bebny");
    expect(described.bpmHint).toBeNull();
    const sent = JSON.parse(String(fetchFn.mock.calls[0]![1].body)) as { model: string };
    expect(sent.model).toBe("gemini-x");
  });

  it("reads the interactions steps shape and ignores the thought", async () => {
    const fetchFn = mockFetch({
      status: "completed",
      steps: [
        { type: "thought", signature: "not-the-answer" },
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                style: "ciepły lo-fi",
                opis: "Miekkie bebny, okagly bas i krotka melodia w tle.",
                drums: "Soft swung drums.",
                bass: "Round short bass motion.",
                melody: "Short background melody.",
                mood: "Warm calm evening.",
                arrangement: "Simple loop with vocal space.",
                bpm: 84,
              }),
            },
          ],
        },
      ],
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.bpmHint).toBe(84);
    expect(described.prompt).toContain("Round short bass");
    expect(described.opis).toContain("Miekkie");
  });

  it("puts tempo and key in front of the brief", async () => {
    const fetchFn = mockFetch({ output_text: JSON.stringify({ ...JSON.parse(payload.output_text), key: "F minor" }) });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.prompt.startsWith("Hip-hop rap instrumental")).toBe(true);
    expect(described.prompt).toContain("97 BPM. Key: F minor.");
    expect(described.prompt.endsWith("Not rock, not metal, not a live band.")).toBe(true);
    expect(described.prompt).toContain("Bright crisp top end");
  });

  it("uses the tempo and key measured from the file instead of Gemini's guess", async () => {
    const fetchFn = mockFetch({
      output_text: JSON.stringify({ ...JSON.parse(payload.output_text), drums: "Hard 161 BPM kick and snare.", bpm: 161, key: "C minor" }),
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
      measured: { bpm: 81, sure: true, candidates: [81, 162], key: "Am" },
    });
    expect(described.bpmHint).toBe(81);
    expect(described.measured).toBe(true);
    expect(described.prompt).toContain("81 BPM. Key: A minor.");
    expect(described.prompt).not.toContain("161");
    const sent = JSON.parse(String(fetchFn.mock.calls[0]![1].body)) as { input: Array<{ type: string; text?: string }> };
    const text = sent.input.find((p) => p.type === "text")?.text ?? "";
    expect(text).toContain("MEASURED from the original audio file: tempo 81 BPM, key A minor.");
  });

  it("lets Gemini only pick between the tempos the file allows when the tracker is unsure", async () => {
    const fetchFn = mockFetch({ output_text: JSON.stringify({ ...JSON.parse(payload.output_text), bpm: 161 }) });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
      measured: { bpm: 120, sure: false, candidates: [80, 120], key: null },
    });
    // 161 is double of 80.5 → the allowed 80, never a free guess.
    expect(described.bpmHint).toBe(80);
  });

  it("sends the old brief and the listener note when revising", async () => {
    const fetchFn = mockFetch(payload);
    await describeBeatStyleFromYouTube(
      CANONICAL,
      { skipAuth: true, env: { GEMINI_API_KEY: "k" }, fetchFn },
      { previousBrief: "Slow boom bap.", note: "za mało energii" },
    );
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    const text = body.input.find((p: { type: string }) => p.type === "text").text as string;
    expect(text).toContain("REVISION");
    expect(text).toContain("Slow boom bap.");
    expect(text).toContain("za mało energii");
  });

  it("asks for a low temperature and retries without it on a plain 400", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (_u: unknown, init?: { body?: string }) => {
      calls.push(String(init?.body));
      if (calls.length === 1) return new Response(JSON.stringify({ error: "bad generation_config" }), { status: 400 });
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]).generation_config.temperature).toBeLessThanOrEqual(0.2);
    expect(JSON.parse(calls[1]).generation_config).toBeUndefined();
    expect(described.prompt).toContain("Soft kick");
  });

  it("adds the generated audio as an audio input and asks Gemini to compare", async () => {
    const fetchFn = mockFetch(payload);
    await describeBeatStyleFromYouTube(
      CANONICAL,
      { skipAuth: true, env: { GEMINI_API_KEY: "k" }, fetchFn, timeoutMs: 40_000 },
      {
        previousBrief: "Slow boom bap.",
        note: "za mało energii",
        audio: { uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "audio/wav" },
      },
    );
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.input[0]).toEqual({ type: "video", uri: CANONICAL });
    expect(body.input[1]).toEqual({
      type: "audio",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
      mime_type: "audio/wav",
    });
    const text = body.input[2].text as string;
    expect(body.input[2].type).toBe("text");
    expect(text).toContain("GENERATED beat");
    expect(text).toContain("Compare it with the video");
  });

  it("sends no audio input for a plain revision", async () => {
    const fetchFn = mockFetch(payload);
    await describeBeatStyleFromYouTube(
      CANONICAL,
      { skipAuth: true, env: { GEMINI_API_KEY: "k" }, fetchFn },
      { previousBrief: "Slow.", note: "więcej energii" },
    );
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.input.map((i: { type: string }) => i.type)).toEqual(["video", "text"]);
  });

  it("drops a tempo above 180", async () => {
    const fetchFn = mockFetch({
      output_text: JSON.stringify({
        style: "szybki trap",
        opis: "Szybkie hi-haty i krotki bas. Energia idzie do przodu.",
        drums: "Fast hi-hats and sharp snare.",
        bass: "Short bouncing bass.",
        melody: "Minimal synth line.",
        mood: "Forward energy.",
        arrangement: "Short loop under a rap.",
        bpm: 200,
      }),
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.bpmHint).toBeNull();
    expect(described.prompt).toContain("Fast hi-hats");
  });

  it("scrubs an echoed video id from the English prompt", async () => {
    const fetchFn = mockFetch({
      output_text: JSON.stringify({
        style: "youtube boom bap",
        opis: "Wolne werble i gleboki bas bez nazw.",
        drums: `Soft snares. Source ${ID} on youtube.`,
        bass: "Deep long bass notes.",
        melody: "Simple piano line.",
        mood: "Dark street mood.",
        arrangement: "Room for a verse.",
        bpm: 90,
      }),
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.prompt).not.toContain(ID);
    expect(described.prompt.toLowerCase()).not.toContain("youtube");
    expect(described.style.toLowerCase()).not.toContain("youtube");
  });

  it("reports a missing key and a private film without the URL", async () => {
    await expect(
      describeBeatStyleFromYouTube(CANONICAL, { skipAuth: true, env: {}, fetchFn: vi.fn() }),
    ).rejects.toThrow("Brak klucza Gemini na serwerze.");

    const fetchFn = vi.fn(async () => new Response("video is private", { status: 400 }));
    const error = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BeatRequestError);
    expect((error as Error).message).toBe("Ten film musi być publiczny na YouTube.");
    expect((error as Error).message).not.toContain(ID);
  });
});

describe("hipHopGuard", () => {
  it("turns a live rock description into a hip-hop one", () => {
    const out = hipHopGuard("Gritty, palm-muted distorted electric guitar riff with chugging power chords and a live drum kit.");
    expect(out).not.toMatch(/distorted|riff|chug|power chord|drum kit|electric/i);
    expect(out).toContain("sampled guitar");
    expect(out).toContain("programmed drums");
  });

  it("leaves a clean hip-hop description alone", () => {
    const text = "Punchy kick on 1 and 3 with a crisp snare and 1/8 hats. Deep 808 with a muted piano loop.";
    expect(hipHopGuard(text)).toBe(text);
  });
});

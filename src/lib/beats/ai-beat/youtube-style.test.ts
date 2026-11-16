import { describe, expect, it, vi } from "vitest";

import { BeatRequestError } from "@/lib/beats/request-error";
import {
  composeProducerOpis,
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
      drums: "Wolne werble i miękka stopa z lekkim swingiem.",
      bass: "Głębokie 808 z długimi nutami.",
      melody: "Krótkie piano w moll.",
      mood: "Ciemny, spokojny nastrój nocny.",
      arrangement: "Pętla z miejscem na zwrotkę.",
    });
    expect(brief).toContain("werble");
    expect(brief).toContain("808");
    expect(brief).toContain("piano");
    expect(brief).toContain("zwrotkę");
  });

  it("falls back to legacy opis when fields are missing", () => {
    expect(
      composeProducerOpis({
        opis: "Wolne werble, głębokie 808 i krótkie piano.",
      }),
    ).toContain("werble");
  });
});

describe("describeBeatStyleFromYouTube", () => {
  const payload = {
    output_text: JSON.stringify({
      style: "ciemny boom bap",
      drums: "Wolne werble i miękka stopa z lekkim swingiem.",
      bass: "Głębokie 808 z długimi nutami.",
      melody: "Krótkie piano w moll zostawia powietrze.",
      mood: "Ciemny, spokojny nastrój nocny.",
      arrangement: "Pętla z miejscem na zwrotkę rapera.",
      bpm: 97,
    }),
  };

  function mockFetch(body: unknown, status = 200) {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    return fetchFn;
  }

  it("asks Gemini with the canonical link and does not fetch YouTube", async () => {
    const fetchFn = mockFetch(payload);
    const described = await describeBeatStyleFromYouTube(
      `https://youtu.be/${ID}?t=4`,
      { skipAuth: true, env: { GEMINI_API_KEY: "test-key" }, fetchFn },
    );
    expect(described.style).toBe("ciemny boom bap");
    expect(described.bpmHint).toBe(97);
    expect(described.opis).toContain("werble");
    expect(described.opis).toContain("808");
    expect(described.opis).toContain("piano");
    expect(described.opis).toContain("zwrotkę");
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
    expect(sent.model).toBe("gemini-4-hydrogen");
    expect(sent.input[0]?.uri).toBe(CANONICAL);
    expect(sent.input[1]?.text).toContain("producer brief");
    expect(sent.response_format?.schema?.required).toEqual(
      expect.arrayContaining(["drums", "bass", "melody", "mood", "arrangement"]),
    );
    expect(String(init.body)).not.toContain("base64");
  });

  it("uses BEAT_STYLE_GEMINI_MODEL and reads fenced legacy JSON", async () => {
    const fetchFn = mockFetch({
      outputs: [{ text: "```json\n{\"style\":\"lofi noc\",\"opis\":\"Ciche bębny i ciepły bas przez cały loop.\",\"bpm\":\"40\"}\n```" }],
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k", BEAT_STYLE_GEMINI_MODEL: "gemini-x" },
      fetchFn,
    });
    expect(described.style).toBe("lofi noc");
    expect(described.opis).toContain("Ciche bębny");
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
                drums: "Miękkie bębny z lekkim swingiem.",
                bass: "Okrągły bas z krótkim ruchem.",
                melody: "Krótka melodia w tle.",
                mood: "Ciepły, spokojny wieczór.",
                arrangement: "Prosta pętla z miejscem na wokal.",
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
    expect(described.opis).toContain("Okrągły bas");
  });

  it("drops a tempo above 180", async () => {
    const fetchFn = mockFetch({
      output_text: JSON.stringify({
        style: "szybki trap",
        drums: "Szybkie hi-haty i ostry werbel.",
        bass: "Krótki bas z bounce.",
        melody: "Minimalna syntezatorowa linia.",
        mood: "Energia idzie do przodu.",
        arrangement: "Krótka pętla pod rap.",
        bpm: 200,
      }),
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.bpmHint).toBeNull();
  });

  it("scrubs an echoed video id", async () => {
    const fetchFn = mockFetch({
      output_text: JSON.stringify({
        style: "youtube boom bap",
        drums: `Wolne werble. Źródło ${ID} na youtube.`,
        bass: "Głęboki bas z długimi nutami.",
        melody: "Prosta linia piano.",
        mood: "Ciemny klimat uliczny.",
        arrangement: "Miejsce na zwrotkę.",
        bpm: 90,
      }),
    });
    const described = await describeBeatStyleFromYouTube(CANONICAL, {
      skipAuth: true,
      env: { GEMINI_API_KEY: "k" },
      fetchFn,
    });
    expect(described.opis).not.toContain(ID);
    expect(described.opis.toLowerCase()).not.toContain("youtube");
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

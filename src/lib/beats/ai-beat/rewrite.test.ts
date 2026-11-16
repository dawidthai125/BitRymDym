import { describe, expect, it, vi } from "vitest";

import { rewriteBeatPrompt } from "@/lib/beats/ai-beat/rewrite";

describe("rewriteBeatPrompt", () => {
  it("asks xAI with low reasoning and returns parsed JSON fields", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        reasoning_effort?: string;
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
      };
      expect(body.reasoning_effort).toBe("low");
      expect(body.model).toBe("grok-4.7");
      expect(body.messages?.[0]?.content).toContain("Stable Audio 3");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Cień ulicy",
                  prompt:
                    "Instrumental boom bap hip-hop with strong kick, clear snare, deep bass and string melody. No vocals.",
                  style: "poważny boom bap",
                  opis: "Mocna stopa, werbel i bas niosą refleksyjną melodię smyczkową.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const rewritten = await rewriteBeatPrompt(
      "Podkład boom bap z mocną stopą i głębokim basem.",
      null,
      { apiKey: "k", fetchFn },
    );

    expect(rewritten.title).toBe("Cień ulicy");
    expect(rewritten.style).toBe("poważny boom bap");
    expect(rewritten.prompt.toLowerCase()).toContain("instrumental");
    expect(rewritten.opis).toContain("stopa");
  });

  it("keeps an English YouTube brief as the Stable Audio prompt", async () => {
    const english =
      "Soft kick, snappy snare, deep long 808, sparse minor piano, room for a verse.";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        temperature?: number;
        messages?: Array<{ content?: string }>;
      };
      expect(body.temperature).toBe(0.2);
      expect(body.messages?.[0]?.content).toContain("nearly verbatim");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Nocny dach",
                  prompt: "A totally different vague beat.",
                  style: "ciemny boom bap",
                  opis: "Ciemny bit z piano i miejscem na zwrotkę.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const rewritten = await rewriteBeatPrompt(english, 97, {
      apiKey: "k",
      fetchFn,
    });

    expect(rewritten.prompt).toContain("Soft kick");
    expect(rewritten.prompt).toContain("snappy snare");
    expect(rewritten.prompt).toContain("97 BPM");
    expect(rewritten.prompt.toLowerCase()).not.toContain("totally different");
    expect(rewritten.title).toBe("Nocny dach");
    expect(rewritten.style).toBe("ciemny boom bap");
  });

  it("fails closed for Polish text when xAI times out", async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      rewriteBeatPrompt("Podkład z basem i werblem.", 90, {
        apiKey: "k",
        fetchFn,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

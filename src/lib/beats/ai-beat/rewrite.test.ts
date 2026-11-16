import { describe, expect, it, vi } from "vitest";

import { rewriteBeatPrompt } from "@/lib/beats/ai-beat/rewrite";

describe("rewriteBeatPrompt", () => {
  it("asks xAI with low reasoning and returns parsed JSON fields", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        reasoning_effort?: string;
        model?: string;
      };
      expect(body.reasoning_effort).toBe("low");
      expect(body.model).toBe("grok-4.7");
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

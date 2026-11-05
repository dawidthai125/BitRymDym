import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("branded listen decks", () => {
  it("keeps the share player and the finished master off the native audio bar", () => {
    const listen = read("src/components/listen/listen-player.tsx");
    const master = read("src/components/studio/studio-master-step.tsx");
    const deck = read("src/components/player/brd-audio-deck.tsx");
    expect(listen).toContain("BrdAudioDeck");
    expect(listen).not.toMatch(/<audio/i);
    expect(listen).not.toContain("controlsList");
    expect(master).toContain("BrdAudioDeck");
    expect(master).toContain('testId="studio-master-final-audio"');
    expect(master).not.toMatch(/<audio[^>]*\scontrols/i);
    expect(deck).toContain('className="hidden"');
    expect(deck).not.toMatch(/<audio[^>]*\scontrols/i);
    expect(deck.toLowerCase()).not.toContain("pobierz");
    expect(deck).toContain("BrdPlaybackTools");
  });
});

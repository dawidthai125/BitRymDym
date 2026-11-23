import { describe, expect, it } from "vitest";

import { beatMetaDescription, beatMetaTitle, type BeatMetaInput } from "@/lib/seo/beat-meta";

const base: BeatMetaInput = { title: "Nocny Pościg", genre: "Trap", bpm: 98, key: "F", description: "Mroczny trap z ciężkim 808.", lane: "free", locale: "pl" };

describe("beat meta", () => {
  it("titles carry the search phrase", () => {
    expect(beatMetaTitle(base)).toBe("Nocny Pościg — darmowy bit trap 98 BPM do rapu");
    expect(beatMetaTitle({ ...base, lane: "paid" })).toBe("Nocny Pościg — bit trap 98 BPM na wyłączność");
    expect(beatMetaTitle({ ...base, lane: null })).toBe("Nocny Pościg — bit trap 98 BPM");
    expect(beatMetaTitle({ ...base, locale: "en" })).toBe("Nocny Pościg — free Trap rap beat 98 BPM");
    expect(beatMetaTitle({ ...base, genre: null, bpm: 0 })).toBe("Nocny Pościg — darmowy bit do rapu");
  });
  it("descriptions lead with facts and stay short", () => {
    expect(beatMetaDescription(base)).toBe(
      "Darmowy bit trap „Nocny Pościg” (98 BPM, tonacja F). Odsłuchaj i nagraj zwrotkę online w przeglądarce. Mroczny trap z ciężkim 808.",
    );
    const long = beatMetaDescription({ ...base, description: "słowo ".repeat(80) });
    expect(long.length).toBeLessThanOrEqual(158);
    expect(long.endsWith("…")).toBe(true);
    expect(beatMetaDescription({ ...base, lane: "paid", description: null })).toContain("tylko jeden kupiec");
  });
});

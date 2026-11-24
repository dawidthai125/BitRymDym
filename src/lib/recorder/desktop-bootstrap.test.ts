import { describe, expect, it } from "vitest";

import { desktopBootstrapBody } from "./desktop-bootstrap";

describe("desktop bootstrap", () => {
  it("returns the public client and beat ids, nothing else", () => {
    const body = desktopBootstrapBody({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "public-anon",
      beats: [
        { id: "beat-1", title: "Noc", bpm: 140, durationSeconds: 119.6 },
        { id: "beat-2", title: "Dzień", bpm: Number.NaN },
      ],
    });
    expect(Object.keys(body).sort()).toEqual(["anonKey", "beats", "supabaseUrl"]);
    expect(body.beats[1]?.bpm).toBe(0);
    expect(body.beats[0]?.durationSeconds).toBe(120);
    expect(body.beats[1]?.durationSeconds).toBe(0);
    expect(Object.keys(body.beats[0] ?? {}).sort()).toEqual(["bpm", "durationSeconds", "id", "title"]);
    expect(body.beats).toHaveLength(2);
  });

  it("lists the whole catalogue, not the newest 40", () => {
    const beats = Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, title: `B${i}`, bpm: 90 }));
    expect(desktopBootstrapBody({ supabaseUrl: "https://x.supabase.co", anonKey: "k", beats }).beats).toHaveLength(120);
  });

  it("refuses a missing public client", () => {
    expect(() => desktopBootstrapBody({
      supabaseUrl: "",
      anonKey: "public-anon",
      beats: [],
    })).toThrow(/publiczny/);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseChannelFeed } from "@/lib/seo/beat-videos";

const xml = `<feed><entry><yt:videoId>abc123XYZ00</yt:videoId><published>2026-11-23T17:02:11+00:00</published>
<media:group><media:title>Nocny Pościg — darmowy bit</media:title><media:description>Darmowy bit 👉 https://www.bitrymdym.pl/beat/a05b6370-eb60-4dc6-a2b2-f29ea965048c
więcej</media:description></media:group></entry>
<entry><yt:videoId>promo000000</yt:videoId><published>2026-11-20T10:00:00+00:00</published><media:group><media:description>Jak działa BitRymDym</media:description></media:group></entry></feed>`;

describe("channel feed", () => {
  it("maps beat links in descriptions to videos", () => {
    expect(parseChannelFeed(xml)).toEqual({
      "a05b6370-eb60-4dc6-a2b2-f29ea965048c": { videoId: "abc123XYZ00", uploadDate: "2026-11-23", title: "Nocny Pościg — darmowy bit" },
    });
  });
});

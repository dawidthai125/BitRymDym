import { describe, expect, it } from "vitest";

import {
  filterFacts,
  hasPublicItem,
  isProfileLive,
  NO_FACTS,
  NO_SHARES,
  parseShareFlags,
  PROFILE_COLUMNS,
  settingsColumns,
  settingsFromRow,
  SHARE_KEYS,
  type CreatorFacts,
} from "./profile-policy";

const FULL: CreatorFacts<string, string> = {
  trackCount: 3,
  recordingCount: 9,
  beats: { total: 1, items: ["b"] },
  samples: { total: 1, items: ["s"] },
  works: { total: 1, items: [{ id: "w", title: "W", clipSeconds: 45 }] },
  places: [{ kind: "work", period: "week", place: 1, targetId: "w", title: "W" }],
};

describe("public profile switches", () => {
  it("everything is off until it is switched on", () => {
    const settings = settingsFromRow({ public_id: "abcde23456" });
    expect(settings.enabled).toBe(false);
    expect(Object.values(settings.share).every((on) => on === false)).toBe(true);
    expect(filterFacts(FULL, NO_SHARES)).toEqual(NO_FACTS);
  });

  it("each switch opens its own part and nothing else", () => {
    const field = { trackCount: "trackCount", recordingCount: "recordingCount", beats: "beats", samples: "samples", works: "works", rankings: "places" } as const;
    for (const key of SHARE_KEYS) {
      const shown = filterFacts(FULL, { ...NO_SHARES, [key]: true });
      const open = Object.entries(shown).filter(([, value]) => value !== null).map(([name]) => name);
      expect(open).toEqual(key in field ? [field[key as keyof typeof field]] : []);
    }
  });

  it("only a real true turns a switch on", () => {
    expect(parseShareFlags({ beats: "true", samples: 1, works: true, admin: true, email: true })).toEqual({ ...NO_SHARES, works: true });
    for (const bad of [null, "x", [true], 1]) expect(parseShareFlags(bad)).toEqual(NO_SHARES);
  });

  it("a profile blocked by an administrator is not live", () => {
    expect(isProfileLive({ enabled: true, blocked: false })).toBe(true);
    expect(isProfileLive({ enabled: true, blocked: true })).toBe(false);
    expect(isProfileLive({ enabled: false, blocked: false })).toBe(false);
  });

  it("a stored link that is not a known profile address is dropped", () => {
    const settings = settingsFromRow({
      public_id: "abcde23456",
      link_youtube: "https://www.youtube.com/@zolty",
      link_instagram: "javascript:alert(1)",
      link_facebook: "https://evil.example/x",
    });
    expect(settings.links).toEqual({ youtube: "https://www.youtube.com/@zolty" });
  });

  it("the owner can never write blocked, the id or the owner", () => {
    const columns = settingsColumns({
      enabled: true,
      links: { youtube: null, spotify: null, instagram: null, facebook: null, tiktok: null, soundcloud: null },
      share: NO_SHARES,
    });
    for (const column of ["blocked", "public_id", "owner_id"]) expect(columns).not.toHaveProperty(column);
  });

  it("reads no private account columns", () => {
    expect(PROFILE_COLUMNS).not.toMatch(/email|user_number|plan|tier|account_level|payment/);
  });

  it("without a public item the page stays out of search engines", () => {
    expect(hasPublicItem(NO_FACTS)).toBe(false);
    expect(hasPublicItem({ ...NO_FACTS, trackCount: 5, beats: { total: 0, items: [] } })).toBe(false);
    expect(hasPublicItem({ ...NO_FACTS, works: FULL.works })).toBe(true);
  });
});

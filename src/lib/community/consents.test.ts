import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { applyConsentPatch, consentsFromRow, DEFAULT_USER_CONSENTS, parseConsentPatch } from "@/lib/community/consents";

const ALL_ON = { listed: true, allowRatings: true, allowComments: true, inRankings: true };

describe("listing consents", () => {
  it("starts a user work with only the catalogue on", () => {
    expect(DEFAULT_USER_CONSENTS).toEqual({ listed: true, allowRatings: false, allowComments: false, inRankings: false });
  });

  it("ranking turns on ratings and comments", () => {
    expect(applyConsentPatch(DEFAULT_USER_CONSENTS, { inRankings: true })).toEqual(ALL_ON);
    expect(applyConsentPatch(DEFAULT_USER_CONSENTS, { inRankings: true, allowComments: false })).toEqual(ALL_ON);
  });

  it("turning ratings or comments off leaves the ranking and nothing else", () => {
    expect(applyConsentPatch(ALL_ON, { allowRatings: false })).toEqual({ ...ALL_ON, allowRatings: false, inRankings: false });
    expect(applyConsentPatch(ALL_ON, { allowComments: false })).toEqual({ ...ALL_ON, allowComments: false, inRankings: false });
  });

  it("stays in the catalogue when only the ranking is off", () => {
    expect(applyConsentPatch(ALL_ON, { inRankings: false })).toEqual({ ...ALL_ON, inRankings: false });
  });

  it("outside the catalogue there is no ranking", () => {
    expect(applyConsentPatch(ALL_ON, { listed: false })).toEqual({ ...ALL_ON, listed: false, inRankings: false });
    expect(applyConsentPatch({ ...ALL_ON, listed: false, inRankings: false }, { inRankings: true }).inRankings).toBe(false);
  });

  it("parses untrusted input strictly", () => {
    expect(parseConsentPatch({ listed: false, status: "PUBLISHED" })).toEqual({ listed: false });
    expect(parseConsentPatch({ allowRatings: "yes" })).toBeNull();
    expect(parseConsentPatch([])).toBeNull();
    expect(parseConsentPatch(null)).toBeNull();
  });

  it("a missing column never means consent", () => {
    expect(consentsFromRow({}, true)).toEqual(DEFAULT_USER_CONSENTS);
  });

  it("the database keeps the same rule for beats and samples and lets a track always be withdrawn", () => {
    const sql = readFileSync("supabase/migrations/20261123190000_listing_consents.sql", "utf8");
    expect(sql.match(/check \(not in_rankings or \(allow_ratings and allow_comments\)\)/g)).toHaveLength(2);
    expect(sql).toContain("tg_op = 'INSERT' or new.withdrawn_at is null");
  });
});

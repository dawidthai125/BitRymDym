import { describe, expect, it } from "vitest";

import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";
import {
  decideListenCreate,
  hashListenToken,
  LISTEN_TOKEN_RE,
  listenDayOptions,
  listenLinkState,
  listenTokenFor,
} from "./listen-policy";

describe("listen links — policy", () => {
  it("token is deterministic per link, url-safe, secret-dependent; only the hash is stored", async () => {
    const a = await listenTokenFor("s1", "11111111-1111-4111-8111-111111111111");
    expect(a).toMatch(LISTEN_TOKEN_RE);
    expect(await listenTokenFor("s1", "11111111-1111-4111-8111-111111111111")).toBe(a);
    expect(await listenTokenFor("s2", "11111111-1111-4111-8111-111111111111")).not.toBe(a);
    expect(await listenTokenFor("s1", "22222222-2222-4222-8222-222222222222")).not.toBe(a);
    expect(await hashListenToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lifetime options are capped by plan retention", () => {
    expect(listenDayOptions("FREE")).toEqual([1, 2]);
    expect(listenDayOptions("BRONZE")).toEqual([1, 7]);
    expect(listenDayOptions("SILVER")).toEqual([1, 7, 30]);
    expect(listenDayOptions("GOLD")).toEqual([1, 7, 30, 45]);
  });

  it("active link caps: Free 1, Bronze 3, Silver+ unlimited", () => {
    expect(decideListenCreate({ tier: "FREE", active: 0, days: 2 })).toEqual({ allowed: true, days: 2 });
    expect(decideListenCreate({ tier: "FREE", active: 1, days: 1 })).toEqual({ allowed: false, reason: "limit" });
    expect(decideListenCreate({ tier: "FREE", active: 0, days: 7 })).toEqual({ allowed: false, reason: "bad_days" });
    expect(decideListenCreate({ tier: "BRONZE", active: 2, days: 7 }).allowed).toBe(true);
    expect(decideListenCreate({ tier: "BRONZE", active: 3, days: 7 })).toEqual({ allowed: false, reason: "limit" });
    expect(decideListenCreate({ tier: "SILVER", active: 500, days: 30 }).allowed).toBe(true);
    expect(decideListenCreate({ tier: "GOLD", active: 0, days: "x" })).toEqual({ allowed: false, reason: "bad_days" });
  });

  it("state: revoked wins, then expiry", () => {
    const now = Date.parse("2026-10-30T10:00:00Z");
    expect(listenLinkState({ expiresAt: "2026-10-31T00:00:00Z", revokedAt: null }, now)).toBe("active");
    expect(listenLinkState({ expiresAt: "2026-10-29T00:00:00Z", revokedAt: null }, now)).toBe("expired");
    expect(listenLinkState({ expiresAt: "2026-10-31T00:00:00Z", revokedAt: "2026-10-30T09:00:00Z" }, now)).toBe("revoked");
  });

  it("PL/EN message parity (studio.share, listen)", () => {
    const keys = (o: unknown, p = ""): string[] =>
      o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
    expect(keys(pl.studio.share).sort()).toEqual(keys(en.studio.share).sort());
    expect(keys(pl.listen).sort()).toEqual(keys(en.listen).sort());
  });
});

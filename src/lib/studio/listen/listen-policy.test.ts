import { describe, expect, it } from "vitest";

import pl from "../../../../messages/pl.json";
import en from "../../../../messages/en.json";
import {
  decideListenCreate,
  guardedListenLookup,
  hashListenToken,
  LISTEN_RATE,
  LISTEN_TOKEN_RE,
  listenDayOptions,
  listenLinkState,
  listenTokenFor,
  listenTokenMatching,
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

  it("re-derives an existing link with the secret it was created with (new first, legacy fallback)", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const legacy = await listenTokenFor("service-role", id);
    const fresh = await listenTokenFor("dedicated", id);
    expect(await listenTokenMatching(["dedicated", "service-role"], id, await hashListenToken(legacy))).toBe(legacy);
    expect(await listenTokenMatching(["dedicated", "service-role"], id, await hashListenToken(fresh))).toBe(fresh);
    expect(await listenTokenMatching(["dedicated"], id, await hashListenToken(legacy))).toBeNull();
    expect(await listenTokenMatching([], id, await hashListenToken(fresh))).toBeNull();
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

import { listenPlayKey } from "./listen-policy";
describe("listenPlayKey (Free hears only the watermarked file)", () => {
  const key = "u/p/out/master.flac";
  it("Free and unknown plan get the preview, never the clean master", () => {
    expect(listenPlayKey(key, "FREE")).toBe("u/p/out/master_preview.mp3");
    expect(listenPlayKey(key, null)).toBe("u/p/out/master_preview.mp3");
  });
  it("Free with a non-flac key gets nothing (fail closed)", () => {
    expect(listenPlayKey("u/p/out/master.bin", "FREE")).toBeNull();
  });
  it("paid plans keep the approved master", () => {
    expect(listenPlayKey(key, "GOLD")).toBe(key);
  });
});

describe("listen links — public lookup and token guessing (2026-11-26)", () => {
  const good = "A".repeat(32);
  /** In-memory stand-in for studio_listen_peek / studio_listen_hit on one IP bucket. */
  function fakeIp() {
    let misses = 0;
    return {
      get misses() { return misses; },
      missAllowed: async () => misses < LISTEN_RATE.miss.limit,
      recordMiss: async () => { misses++; },
    };
  }
  const links: Record<string, { id: string }> = { [good]: { id: "ok" } };
  const resolve = async (t: string) => links[t] ?? null;

  it("good token works; wrong, expired, revoked and other-project tokens look the same (not_found)", async () => {
    const ip = fakeIp();
    expect(await guardedListenLookup({ token: good, ...ip, resolve })).toEqual({ status: "ok", link: { id: "ok" } });
    // resolve() returns null for unknown, expired, revoked and cross-project tokens alike (listen-server).
    for (const t of ["B".repeat(32), "short", "../../etc", ""]) {
      expect(await guardedListenLookup({ token: t, ...ip, resolve })).toEqual({ status: "not_found" });
    }
    expect(ip.misses).toBe(4);
  });

  it("guessing hits the limit: after the miss limit even a valid token is refused from that IP", async () => {
    const ip = fakeIp();
    for (let i = 0; i < LISTEN_RATE.miss.limit; i++) {
      const t = `G${String(i).padStart(31, "0")}`;
      expect((await guardedListenLookup({ token: t, ...ip, resolve })).status).toBe("not_found");
    }
    expect(await guardedListenLookup({ token: "Z".repeat(32), ...ip, resolve })).toEqual({ status: "limited" });
    expect(await guardedListenLookup({ token: good, ...ip, resolve })).toEqual({ status: "limited" });
    // Another IP is not affected.
    expect((await guardedListenLookup({ token: good, ...fakeIp(), resolve })).status).toBe("ok");
  });

  it("fails closed when the limiter cannot answer; a resolver error counts as a miss", async () => {
    const down = { missAllowed: async () => { throw new Error("db"); }, recordMiss: async () => undefined };
    expect(await guardedListenLookup({ token: good, ...down, resolve })).toEqual({ status: "limited" });
    const ip = fakeIp();
    const broken = async () => { throw new Error("db"); };
    expect(await guardedListenLookup({ token: good, ...ip, resolve: broken })).toEqual({ status: "not_found" });
    expect(ip.misses).toBe(1);
  });

  it("the miss limit is strict enough that guessing a 192-bit token is hopeless", () => {
    expect(LISTEN_RATE.miss.limit).toBeLessThanOrEqual(20);
    expect(LISTEN_TOKEN_RE.source).toContain("{32}");
  });
});

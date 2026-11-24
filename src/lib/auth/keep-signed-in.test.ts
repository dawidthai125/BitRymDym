import { describe, expect, it } from "vitest";

import {
  applySessionLifetime,
  isDocumentRequest,
  isSessionOnly,
  restampedSessionCookies,
  wantsSessionOnly,
} from "@/lib/auth/keep-signed-in";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe("Nie wylogowuj mnie", () => {
  it("keeps the session unless the visible box was unticked", () => {
    expect(wantsSessionOnly(form({}))).toBe(false);
    expect(wantsSessionOnly(form({ keepSignedInShown: "1", keepSignedIn: "on" }))).toBe(false);
    expect(wantsSessionOnly(form({ keepSignedInShown: "1" }))).toBe(true);
    expect(isSessionOnly("1")).toBe(true);
    expect(isSessionOnly(undefined)).toBe(false);
  });

  it("drops the expiry only for session-only writes, never for removals", () => {
    const keep = { path: "/", maxAge: 400 };
    expect(applySessionLifetime(keep, false)).toEqual(keep);
    expect(applySessionLifetime(keep, true)).toEqual({ path: "/" });
    expect(applySessionLifetime({ path: "/", maxAge: 0 }, true)).toEqual({ path: "/", maxAge: 0 });
  });

  it("recognises full page loads", () => {
    expect(isDocumentRequest("GET", new Headers({ "sec-fetch-dest": "document" }))).toBe(true);
    expect(isDocumentRequest("POST", new Headers({ "sec-fetch-dest": "document" }))).toBe(false);
    expect(isDocumentRequest("GET", new Headers({ "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isDocumentRequest("GET", new Headers({ "sec-fetch-dest": "document", "sec-purpose": "prefetch" }))).toBe(false);
  });

  it("rewrites only a fresh, kept session", () => {
    const now = 1_000_000;
    const value = (exp: number) => "base64-" + Buffer.from(JSON.stringify({ expires_at: exp, user: "ż" })).toString("base64url");
    const fresh = value(now + 3000);
    const one = [{ name: "sb-x-auth-token", value: fresh }];
    expect(restampedSessionCookies(one, now)).toEqual([{ ...one[0], maxAge: 34_560_000 }]);
    const parts = [
      { name: "sb-x-auth-token.1", value: fresh.slice(20) },
      { name: "sb-x-auth-token.0", value: fresh.slice(0, 20) },
    ];
    expect(restampedSessionCookies(parts, now).map((c) => c.name)).toEqual(["sb-x-auth-token.0", "sb-x-auth-token.1"]);
    expect(restampedSessionCookies([{ name: "sb-x-auth-token", value: value(now + 60) }], now)).toEqual([]);
    expect(restampedSessionCookies([...one, { name: "brd_session_only", value: "1" }], now)).toEqual([]);
    expect(restampedSessionCookies([{ name: "sb-x-auth-token-code-verifier", value: fresh }], now)).toEqual([]);
    expect(restampedSessionCookies([{ name: "sb-x-auth-token", value: "zzz" }], now)).toEqual([]);
  });
});

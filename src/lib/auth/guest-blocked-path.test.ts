import { describe, expect, it } from "vitest";


import { isGuestBlockedPath } from "@/middleware";

describe("guest Studio gate (middleware)", () => {
  it("blocks Studio pages and Studio / guest-take APIs", () => {
    expect(isGuestBlockedPath("/studio")).toBe("page");
    expect(isGuestBlockedPath("/studio/p/abc")).toBe("page");
    expect(isGuestBlockedPath("/api/studio/projects")).toBe("api");
    expect(isGuestBlockedPath("/api/takes/anon/session")).toBe("api");
  });
  it("blocks account areas so the sign-in keeps ?next=", () => {
    for (const p of ["/account", "/account/takes", "/settings", "/library", "/admin", "/admin/lejek", "/mastering"]) {
      expect(isGuestBlockedPath(p)).toBe("page");
    }
  });
  it("leaves everything else alone", () => {
    for (const p of ["/", "/beat/1", "/studios", "/studiox", "/api/takes/user", "/premium", "/sign-in", "/accounts", "/administracja", "/api/admin/x"]) {
      expect(isGuestBlockedPath(p)).toBeNull();
    }
  });
});

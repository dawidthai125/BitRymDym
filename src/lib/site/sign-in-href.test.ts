import { describe, expect, it } from "vitest";

import { signInHrefFor } from "@/lib/site/sign-in-href";

describe("signInHrefFor", () => {
  it("keeps path and query, also under /en", () => {
    expect(signInHrefFor("/sampel?strona=2")).toBe("/sign-in?next=%2Fsampel%3Fstrona%3D2");
    expect(signInHrefFor("/en/beat/abc")).toBe("/sign-in?next=%2Fen%2Fbeat%2Fabc");
    expect(signInHrefFor("/en/beats")).toBe("/sign-in?next=%2Fen%2Fbeats");
  });
  it("adds nothing on home and account-access pages", () => {
    for (const path of ["/", "/?ref=ABC", "/en", "/sign-in?next=%2Fbeats", "/sign-up", "/forgot-password", "/resend-confirmation", "/auth/confirmed", "/maintenance"]) {
      expect(signInHrefFor(path)).toBe("/sign-in");
    }
  });
  it("rejects foreign addresses", () => {
    expect(signInHrefFor("//evil.example")).toBe("/sign-in");
  });
});

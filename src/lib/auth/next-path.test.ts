import { describe, expect, it } from "vitest";

import { safeNextPath, signInPathWithNext } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("accepts same-origin paths", () => {
    expect(safeNextPath("/studio")).toBe("/studio");
    expect(safeNextPath("/studio/p/abc?x=1")).toBe("/studio/p/abc?x=1");
  });
  it("rejects open redirects and junk", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "/a\\b", "/x\ny", "", null, 5, "/sign-in"]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
  it("builds the sign-in URL", () => {
    expect(signInPathWithNext("/studio/p/1")).toBe("/sign-in?next=%2Fstudio%2Fp%2F1");
    expect(signInPathWithNext("//evil")).toBe("/sign-in");
  });
});

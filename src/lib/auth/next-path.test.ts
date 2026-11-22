import { describe, expect, it } from "vitest";

import {
  pathWithKeptQuery,
  postAuthRedirectPath,
  safeNextPath,
  signInPathWithNext,
} from "@/lib/auth/next-path";

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

describe("postAuthRedirectPath", () => {
  it("claimed take wins, then safe next, then fallback", () => {
    expect(postAuthRedirectPath({ ux: "ok" }, "/beats", "/studio")).toBe("/account?claim=ok");
    expect(postAuthRedirectPath({ ux: "none" }, "/beats", "/studio")).toBe("/beats");
    expect(postAuthRedirectPath(null, "/beats", "/account")).toBe("/beats");
    expect(postAuthRedirectPath({ ux: "none" }, null, "/studio")).toBe("/studio");
  });
  it("never returns a foreign next", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
      expect(postAuthRedirectPath({ ux: "none" }, bad, "/studio")).toBe("/studio");
    }
  });
});

describe("pathWithKeptQuery (guest → sign-in next)", () => {
  it("keeps only the listed keys, encoded", () => {
    expect(pathWithKeptQuery("/studio", { beatId: "b 1&x=2", notice: "n" }, ["beatId"])).toBe(
      "/studio?beatId=b+1%26x%3D2",
    );
    expect(pathWithKeptQuery("/studio", { beatId: ["a", "b"] }, ["beatId"])).toBe("/studio?beatId=a");
    expect(pathWithKeptQuery("/studio", {}, ["beatId"])).toBe("/studio");
    expect(pathWithKeptQuery("/studio", undefined, ["beatId"])).toBe("/studio");
  });
  it("round-trips through sign-in next", () => {
    const next = pathWithKeptQuery("/studio", { beatId: "abc" }, ["beatId"]);
    expect(signInPathWithNext(next)).toBe("/sign-in?next=%2Fstudio%3FbeatId%3Dabc");
    expect(safeNextPath(pathWithKeptQuery("/studio", { beatId: "\\evil" }, ["beatId"]))).toBe(
      "/studio?beatId=%5Cevil",
    );
  });
});

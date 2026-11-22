import { describe, expect, it } from "vitest";

import {
  canDeleteComment,
  cleanReportDetails,
  hideRole,
  isCommentVisible,
  parseReportReason,
  shouldAutoHide,
  threadHref,
} from "@/lib/community/comment-moderation-policy";

describe("comment moderation policy", () => {
  it("parses only listed reasons", () => {
    expect(parseReportReason("spam")).toBe("spam");
    expect(parseReportReason("illegal")).toBe("illegal");
    expect(parseReportReason("SPAM")).toBeNull();
    expect(parseReportReason(1)).toBeNull();
  });

  it("cleans optional details up to 500 chars", () => {
    expect(cleanReportDetails(undefined)).toBeNull();
    expect(cleanReportDetails("   ")).toBeNull();
    expect(cleanReportDetails(" ok ")).toBe("ok");
    expect(cleanReportDetails("x".repeat(500))).toHaveLength(500);
    expect(cleanReportDetails("x".repeat(501))).toBeUndefined();
    expect(cleanReportDetails(5)).toBeUndefined();
  });

  it("only the author deletes", () => {
    expect(canDeleteComment("a", "a")).toBe(true);
    expect(canDeleteComment("b", "a")).toBe(false);
    expect(canDeleteComment(null, "a")).toBe(false);
  });

  it("work owner or staff hides", () => {
    expect(hideRole({ viewerId: "o", workOwnerId: "o", role: "USER" })).toBe("owner");
    expect(hideRole({ viewerId: "m", workOwnerId: "o", role: "MODERATOR" })).toBe("staff");
    expect(hideRole({ viewerId: "a", workOwnerId: "o", role: "ADMIN" })).toBe("staff");
    expect(hideRole({ viewerId: "x", workOwnerId: "o", role: "USER" })).toBeNull();
    expect(hideRole({ viewerId: "x", workOwnerId: null, role: "USER" })).toBeNull();
    expect(hideRole({ viewerId: null, workOwnerId: null, role: "ADMIN" })).toBeNull();
  });

  it("visibility, threshold and thread links", () => {
    expect(isCommentVisible({ deleted_at: null, hidden_at: null })).toBe(true);
    expect(isCommentVisible({ deleted_at: "t", hidden_at: null })).toBe(false);
    expect(isCommentVisible({ deleted_at: null, hidden_at: "t" })).toBe(false);
    expect(shouldAutoHide(2)).toBe(false);
    expect(shouldAutoHide(3)).toBe(true);
    expect(threadHref("beat", "b")).toBe("/beat/b");
    expect(threadHref("work", "w")).toBe("/utwor/w");
    expect(threadHref("sample", "s")).toBe("/sampel");
  });
});

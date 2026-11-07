import { describe, expect, it } from "vitest";

import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import {
  canCommentPublic,
  canRatePublic,
  PLATFORM_AUTHOR,
  publicAuthorName,
} from "@/lib/community/share-policy";

describe("public share gate", () => {
  it("rates only a published public listing and comments only when the author allows them", () => {
    expect(canRatePublic({ published: true, listed: true })).toBe(true);
    expect(canRatePublic({ published: true, listed: false })).toBe(false);
    expect(canRatePublic({ published: false, listed: true })).toBe(false);
    expect(canCommentPublic({ published: true, listed: true, allowComments: true })).toBe(true);
    expect(canCommentPublic({ published: true, listed: true, allowComments: false })).toBe(false);
    expect(canCommentPublic({ published: true, listed: false, allowComments: true })).toBe(false);
  });

  it("always has an author name", () => {
    expect(publicAuthorName({ ownership: "PLATFORM", producer: null })).toBe(PLATFORM_AUTHOR);
    expect(publicAuthorName({ ownership: "PLATFORM", producer: "Redakcja" })).toBe("Redakcja");
    expect(publicAuthorName({ ownership: "USER", displayName: "Mira", producer: "Stare" })).toBe("Mira");
    expect(publicAuthorName({ ownership: "USER", displayName: "  ", producer: null })).toBe(ANONYMIZED_PUBLIC_AUTHOR);
  });
});

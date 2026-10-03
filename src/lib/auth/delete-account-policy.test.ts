import { describe, expect, it } from "vitest";

import {
  assertDeleteTargetsSessionUser,
  classifyOwnedBeatsForDelete,
  filterPrivateStorageKeysToDelete,
} from "@/lib/auth/delete-account-policy";

describe("delete account policy", () => {
  it("retains PUBLISHED USER beats and deletes private statuses", () => {
    const r = classifyOwnedBeatsForDelete([
      { id: "a", status: "PUBLISHED", ownershipType: "USER" },
      { id: "b", status: "DRAFT", ownershipType: "USER" },
      { id: "c", status: "PENDING_REVIEW", ownershipType: "USER" },
      { id: "d", status: "PUBLISHED", ownershipType: "PLATFORM" },
    ]);
    expect(r.retainIds).toEqual(["a"]);
    expect(r.deleteIds).toEqual(["b", "c"]);
  });

  it("filters Storage keys selectively", () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    const retained = new Set([`user/${uid}/beat1/asset1/master.bin`]);
    const keys = filterPrivateStorageKeysToDelete({
      userId: uid,
      retainedKeys: retained,
      candidateKeys: [
        `user/${uid}/beat1/asset1/master.bin`,
        `user/${uid}/takes/t1/mic.bin`,
        "platform/x/y/master.bin",
        "anon/z/mic.bin",
        `user/other/takes/t2/mic.bin`,
      ],
    });
    expect(keys).toEqual([`user/${uid}/takes/t1/mic.bin`]);
  });

  it("denies foreign UUID as delete authority", () => {
    expect(() =>
      assertDeleteTargetsSessionUser({
        sessionUserId: "aaa",
        claimedUserId: "bbb",
      }),
    ).toThrow(/Forbidden/);
  });

  it("allows delete when no foreign claim", () => {
    expect(() =>
      assertDeleteTargetsSessionUser({
        sessionUserId: "aaa",
        claimedUserId: null,
        claimedUserNumber: "99",
        claimedEmail: "evil@example.com",
      }),
    ).not.toThrow();
  });
});

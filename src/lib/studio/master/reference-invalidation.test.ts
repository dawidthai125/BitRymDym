import { describe, expect, it } from "vitest";

import { referenceEditInvalidatesMaster } from "@/lib/studio/master/reference-invalidation";

describe("reference hydration does not drop an approved master", () => {
  it("ignores the first load, including a file that was already there", () => {
    expect(
      referenceEditInvalidatesMaster(
        { loaded: false, referenceId: null },
        "ref-1",
      ),
    ).toBe(false);
    expect(
      referenceEditInvalidatesMaster(
        { loaded: false, referenceId: null },
        null,
      ),
    ).toBe(false);
  });

  it("invalidates when the user adds, replaces, or removes a reference", () => {
    expect(
      referenceEditInvalidatesMaster(
        { loaded: true, referenceId: null },
        "ref-1",
      ),
    ).toBe(true);
    expect(
      referenceEditInvalidatesMaster(
        { loaded: true, referenceId: "ref-1" },
        null,
      ),
    ).toBe(true);
    expect(
      referenceEditInvalidatesMaster(
        { loaded: true, referenceId: "ref-1" },
        "ref-1",
      ),
    ).toBe(false);
  });
});

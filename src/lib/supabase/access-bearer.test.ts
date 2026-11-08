import { describe, expect, it } from "vitest";

import { userAccessBearer } from "./access-bearer";

describe("desktop account bearer", () => {
  it("keeps a three-part user token", () => {
    expect(userAccessBearer("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
  });

  it("rejects a missing header and a raw secret", () => {
    expect(userAccessBearer(null)).toBeNull();
    expect(userAccessBearer("Bearer not-a-jwt")).toBeNull();
    expect(userAccessBearer("Basic aaa.bbb.ccc")).toBeNull();
  });
});

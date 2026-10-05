import { describe, expect, it } from "vitest";

import {
  mapClaimRpcMessageToError,
  messageForTakeClaimCode,
  parseTakeClaimCodeFromRpc,
  TakeClaimError,
} from "@/lib/takes/claim-errors";

describe("P2 claim/replace structured errors", () => {
  it("parses REPLACE_* codes from RPC messages", () => {
    expect(parseTakeClaimCodeFromRpc("REPLACE_REQUIRED")).toBe("REPLACE_REQUIRED");
    expect(parseTakeClaimCodeFromRpc("error: REPLACE_OWNERSHIP_DENIED")).toBe(
      "REPLACE_OWNERSHIP_DENIED",
    );
    expect(parseTakeClaimCodeFromRpc("ACTIVE_READY_CAP")).toBe("REPLACE_REQUIRED");
    expect(parseTakeClaimCodeFromRpc("SESSION_DAY_CAP")).toBe("SESSION_DAY_CAP");
    expect(parseTakeClaimCodeFromRpc("unrelated")).toBeNull();
  });

  it("mapClaimRpcMessageToError throws TakeClaimError with REPLACE_REQUIRED list", () => {
    try {
      mapClaimRpcMessageToError("REPLACE_REQUIRED", {
        replaceableTakes: [
          {
            id: "t1",
            beatId: "b1",
            beatTitle: "X",
            durationSeconds: 10,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        ],
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TakeClaimError);
      const err = e as TakeClaimError;
      expect(err.claimCode).toBe("REPLACE_REQUIRED");
      expect(err.replaceableTakes).toHaveLength(1);
      expect(err.message).toContain("REPLACE_REQUIRED");
    }
  });

  it("ownership / not ready / expired / conflict messages are distinct", () => {
    expect(messageForTakeClaimCode("REPLACE_OWNERSHIP_DENIED")).toContain(
      "REPLACE_OWNERSHIP_DENIED",
    );
    expect(messageForTakeClaimCode("REPLACE_NOT_READY")).toContain("REPLACE_NOT_READY");
    expect(messageForTakeClaimCode("REPLACE_EXPIRED")).toContain("REPLACE_EXPIRED");
    expect(messageForTakeClaimCode("REPLACE_CONFLICT")).toContain("REPLACE_CONFLICT");
    expect(messageForTakeClaimCode("REPLACE_IDEMPOTENCY_REPLAY")).toContain(
      "REPLACE_IDEMPOTENCY_REPLAY",
    );
  });
});

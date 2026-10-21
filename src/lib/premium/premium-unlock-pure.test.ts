import { describe, expect, it } from "vitest";

import {
  createEmptyUnlockStore,
  pureMarkWorkReady,
  pureUnlockWork,
} from "@/lib/premium/premium-unlock-pure";

describe("PREMIUM-02 pure unlock / R1 ready", () => {
  it("marks WORK_READY once; tip re-mark does not restart retention", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1_700_000_000_000;
    const a = pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "BRONZE",
      nowMs: t0,
    });
    expect(a.created).toBe(true);
    const b = pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "BRONZE",
      nowMs: t0 + 60_000,
    });
    expect(b.created).toBe(false);
    expect(b.retentionExpiresAtMs).toBe(a.retentionExpiresAtMs);
  });

  it("consumes one credit; sticky unlock; multi download free", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1_700_000_000_000;
    pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "SILVER",
      nowMs: t0,
    });
    const first = pureUnlockWork({
      store,
      userId: "u1",
      workId: "w1",
      idempotencyKey: "unlock:w1",
      premiumTier: "SILVER",
      activatedAtMs: t0,
      nowMs: t0 + 1000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.reused).toBe(false);
    expect(first.creditsRemaining).toBe(1);

    const retry = pureUnlockWork({
      store,
      userId: "u1",
      workId: "w1",
      idempotencyKey: "unlock:w1",
      premiumTier: "SILVER",
      activatedAtMs: t0,
      nowMs: t0 + 2000,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.reused).toBe(true);
    expect(store.periods[0]?.consumed).toBe(1);
  });

  it("KEY_REUSE denies same key for different work", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1_700_000_000_000;
    pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "GOLD",
      nowMs: t0,
    });
    pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w2",
      premiumTier: "GOLD",
      nowMs: t0,
    });
    expect(
      pureUnlockWork({
        store,
        userId: "u1",
        workId: "w1",
        idempotencyKey: "same-key",
        premiumTier: "GOLD",
        activatedAtMs: t0,
        nowMs: t0 + 1,
      }).ok,
    ).toBe(true);
    const reuse = pureUnlockWork({
      store,
      userId: "u1",
      workId: "w2",
      idempotencyKey: "same-key",
      premiumTier: "GOLD",
      activatedAtMs: t0,
      nowMs: t0 + 2,
    });
    expect(reuse).toEqual({ ok: false, reason: "KEY_REUSE" });
  });

  it("FREE has no credits; expired work cannot unlock", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1_700_000_000_000;
    pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "FREE",
      nowMs: t0,
    });
    expect(
      pureUnlockWork({
        store,
        userId: "u1",
        workId: "w1",
        idempotencyKey: "k",
        premiumTier: "FREE",
        activatedAtMs: t0,
        nowMs: t0 + 1,
      }),
    ).toEqual({ ok: false, reason: "NO_CREDITS" });

    const store2 = createEmptyUnlockStore();
    pureMarkWorkReady({
      store: store2,
      userId: "u1",
      workId: "w1",
      premiumTier: "BRONZE",
      nowMs: t0,
    });
    const work = store2.works.get("w1")!;
    work.retentionExpiresAtMs = t0 + 10;
    expect(
      pureUnlockWork({
        store: store2,
        userId: "u1",
        workId: "w1",
        idempotencyKey: "k2",
        premiumTier: "BRONZE",
        activatedAtMs: t0,
        nowMs: t0 + 11,
      }),
    ).toEqual({ ok: false, reason: "EXPIRED_OR_NOT_READY" });
  });

  it("serializes concurrent unlocks — only one credit consumed (sticky reuse)", () => {
    const store = createEmptyUnlockStore();
    const t0 = 1_700_000_000_000;
    pureMarkWorkReady({
      store,
      userId: "u1",
      workId: "w1",
      premiumTier: "BRONZE",
      nowMs: t0,
    });
    const results = ["a", "b", "c"].map((suffix) =>
      pureUnlockWork({
        store,
        userId: "u1",
        workId: "w1",
        idempotencyKey: `parallel:${suffix}`,
        premiumTier: "BRONZE",
        activatedAtMs: t0,
        nowMs: t0 + 1,
      }),
    );
    const fresh = results.filter((r) => r.ok && !r.reused);
    const reused = results.filter((r) => r.ok && r.reused);
    expect(fresh).toHaveLength(1);
    expect(reused).toHaveLength(2);
    expect(store.periods[0]?.consumed).toBe(1);
    expect(store.unlocks).toHaveLength(1);
  });
});

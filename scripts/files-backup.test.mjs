import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blobName, KEEP_DELETED_DAYS, listingLooksBroken, planPrune, SOURCES } from "./files-backup.mjs";

const DAY = 86_400_000;

describe("files backup", () => {
  it("copies catalogue files only, never user recordings or private samples", () => {
    const paths = SOURCES.flatMap((s) => s.prefixes.map((p) => `${s.bucket}/${p}`));
    assert.deepEqual(paths, ["beat-audio/platform", "beat-audio/catalog", "beat-covers/platform"]);
  });

  it("stores a changed file as a new version", () => {
    const file = { bucket: "b", name: "platform/x.wav", etag: "1", size: 10 };
    assert.equal(blobName(file), blobName({ ...file }));
    assert.notEqual(blobName(file), blobName({ ...file, etag: "2" }));
  });

  it("keeps a deleted file for 30 days, then drops it", () => {
    const now = 1000 * DAY;
    const index = { live: { lastSeen: 0 }, fresh: { lastSeen: now - 5 * DAY }, old: { lastSeen: now - (KEEP_DELETED_DAYS + 1) * DAY } };
    const plan = planPrune(index, new Set(["live"]), now);
    assert.deepEqual(plan.drop, ["old"]);
    assert.equal(plan.kept.live.lastSeen, now);
    assert.equal(plan.kept.fresh.lastSeen, now - 5 * DAY);
  });

  it("treats a listing that lost half of the files as broken", () => {
    assert.equal(listingLooksBroken(353, 100), true);
    assert.equal(listingLooksBroken(353, 340), false);
    assert.equal(listingLooksBroken(0, 5), false);
  });
});

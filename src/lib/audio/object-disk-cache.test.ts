import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  objectCachePath,
  readObjectCache,
  writeObjectCache,
} from "@/lib/audio/object-disk-cache";

describe("object disk cache", () => {
  let dir: string;

  afterEach(async () => {
    delete process.env.BITRYMDYM_OBJECT_CACHE_DIR;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads the same bytes after one write and ignores an empty file", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "brd-object-cache-"));
    process.env.BITRYMDYM_OBJECT_CACHE_DIR = dir;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(await readObjectCache("beat-audio", "platform/a/master.bin")).toBeNull();
    await writeObjectCache("beat-audio", "platform/a/master.bin", bytes);
    const again = await readObjectCache("beat-audio", "platform/a/master.bin");
    expect(again).toEqual(bytes);
    expect(objectCachePath("beat-audio", "platform/a/master.bin").startsWith(dir)).toBe(true);
    expect(objectCachePath("beat-audio", "other")).not.toBe(
      objectCachePath("audio-artifacts", "other"),
    );
  });
});

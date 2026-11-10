import assert from "node:assert/strict";
import test from "node:test";

import { objectCacheName, parseBeatSignUrl, publicEdgeUrl } from "./audio-edge-lib.mjs";

const ORIGIN = "https://rzzxrgcdogkybkiidqgw.supabase.co";
const SIGNED = `${ORIGIN}/storage/v1/object/sign/beat-audio/platform/a/master.bin?token=abc`;

test("cache name matches the worker digest", () => {
  assert.equal(objectCacheName("beat-audio", "platform/a/master.bin").length, 64);
  assert.notEqual(
    objectCacheName("beat-audio", "platform/a/master.bin"),
    objectCacheName("beat-audio", "platform/a/preview.bin"),
  );
});

test("accepts a beat-audio signed URL and ignores the token", () => {
  const a = parseBeatSignUrl(SIGNED, ORIGIN);
  const b = parseBeatSignUrl(SIGNED.replace("token=abc", "token=other"), ORIGIN);
  assert.deepEqual(a, { bucket: "beat-audio", objectKey: "platform/a/master.bin", download: false });
  assert.deepEqual(a, b);
});

test("rejects other hosts, buckets, and traversal", () => {
  assert.equal(parseBeatSignUrl(SIGNED.replace(ORIGIN, "https://evil.example"), ORIGIN), null);
  assert.equal(
    parseBeatSignUrl(SIGNED.replace("/beat-audio/", "/audio-artifacts/"), ORIGIN),
    null,
  );
  assert.equal(
    parseBeatSignUrl(`${ORIGIN}/storage/v1/object/sign/beat-audio/../secret`, ORIGIN),
    null,
  );
  assert.equal(parseBeatSignUrl("http://127.0.0.1/latest", ORIGIN), null);
});

test("public URL points at the edge", () => {
  const out = publicEdgeUrl("https://edge.bitrymdym.pl/", SIGNED);
  assert.equal(out.startsWith("https://edge.bitrymdym.pl/s?u="), true);
  assert.equal(decodeURIComponent(out.split("u=")[1]), SIGNED);
  assert.equal(publicEdgeUrl("", SIGNED), SIGNED);
});

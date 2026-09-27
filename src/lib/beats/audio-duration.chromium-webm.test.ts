import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { parseBuffer } from "music-metadata";

import { probeAudioDurationFromBytes } from "@/lib/beats/audio-duration";
import {
  isLikelyEbmlWebmContainer,
  probeDurationSecondsViaAudioDecode,
} from "@/lib/beats/webm-duration-fallback";

const chromiumWebmPath = resolve(
  process.cwd(),
  "src/lib/beats/fixtures/chromium-mediarecorder-opus.webm",
);

function readChromiumWebm(): Uint8Array {
  return new Uint8Array(readFileSync(chromiumWebmPath));
}

describe("Chromium MediaRecorder WebM/Opus duration (W3 production blocker)", () => {
  it("music-metadata alone does NOT expose format.duration (repro)", async () => {
    const bytes = readChromiumWebm();
    const meta = await parseBuffer(
      Buffer.from(bytes),
      { mimeType: "audio/webm" },
      { duration: true },
    );
    expect(meta.format.codec).toMatch(/OPUS/i);
    expect(meta.format.container).toMatch(/EBML/i);
    expect(meta.format.duration).toBeUndefined();
  });

  it("detects EBML/WebM container by magic and MIME hint", () => {
    const bytes = readChromiumWebm();
    expect(
      isLikelyEbmlWebmContainer({ bytes, contentTypeHint: "audio/webm" }),
    ).toBe(true);
    expect(
      isLikelyEbmlWebmContainer({
        bytes,
        contentTypeHint: "audio/webm;codecs=opus",
      }),
    ).toBe(true);
    expect(
      isLikelyEbmlWebmContainer({
        bytes: new Uint8Array([1, 2, 3, 4]),
        contentTypeHint: "audio/wav",
      }),
    ).toBe(false);
  });

  it("audio-decode fallback derives positive duration from PCM", async () => {
    const bytes = readChromiumWebm();
    const raw = await probeDurationSecondsViaAudioDecode(bytes);
    expect(raw).not.toBeNull();
    expect(raw!).toBeGreaterThan(2.5);
    expect(raw!).toBeLessThan(5);
  });

  it("WEBM_OPUS_CHROMIUM: probeAudioDurationFromBytes PASS via server fallback", async () => {
    const bytes = readChromiumWebm();
    const result = await probeAudioDurationFromBytes({
      bytes,
      contentTypeHint: "audio/webm",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(result.durationSeconds).toBeLessThanOrEqual(4);
      expect(result.durationRawSeconds).toBeGreaterThan(2.5);
    }
  });

  it("malformed WebM / garbage → duration unavailable DENY", async () => {
    const garbage = new Uint8Array(Buffer.from("not-a-real-webm-file-xxxxxxxx"));
    // Pretend MIME is webm (attacker upload) but bytes are junk.
    const result = await probeAudioDurationFromBytes({
      bytes: garbage,
      contentTypeHint: "audio/webm",
    });
    expect(result.ok).toBe(false);
  });

  it("EBML header with no decodable audio → DENY", async () => {
    // Minimal EBML magic + junk (not a valid Opus bitstream).
    const bytes = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    ]);
    const result = await probeAudioDurationFromBytes({
      bytes,
      contentTypeHint: "audio/webm",
    });
    expect(result.ok).toBe(false);
  });
});

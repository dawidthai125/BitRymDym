import { describe, expect, it, vi } from "vitest";

import {
  probeAudioDurationFromBytes,
  roundDurationSeconds,
} from "@/lib/beats/audio-duration";
import { BEAT_DURATION_MAX, BEAT_DURATION_MIN } from "@/lib/beats/validation";

vi.mock("music-metadata", () => ({
  parseBuffer: vi.fn(),
}));

import { parseBuffer } from "music-metadata";

const parseBufferMock = vi.mocked(parseBuffer);

function pcmWavBytes(durationSeconds: number, sampleRate = 8000): Uint8Array {
  const numSamples = Math.max(1, Math.round(durationSeconds * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return new Uint8Array(buffer);
}

describe("roundDurationSeconds", () => {
  it("uses Math.round half-up", () => {
    expect(roundDurationSeconds(37.42)).toBe(37);
    expect(roundDurationSeconds(37.5)).toBe(38);
    expect(roundDurationSeconds(1.49)).toBe(1);
  });
});

describe("probeAudioDurationFromBytes", () => {
  it("accepts valid duration within 1–180", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: { duration: 37.42 },
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
      contentTypeHint: "audio/wav",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.durationSeconds).toBe(37);
      expect(result.durationRawSeconds).toBe(37.42);
    }
  });

  it("accepts boundary 1 second", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: { duration: 1 },
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.durationSeconds).toBe(BEAT_DURATION_MIN);
    }
  });

  it("accepts boundary 180 seconds", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: { duration: 180 },
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.durationSeconds).toBe(BEAT_DURATION_MAX);
    }
  });

  it("rejects duration above 180", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: { duration: 181.2 },
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/180/);
    }
  });

  it("rejects zero duration", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: { duration: 0 },
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects missing duration", async () => {
    parseBufferMock.mockResolvedValueOnce({
      format: {},
    } as Awaited<ReturnType<typeof parseBuffer>>);

    const result = await probeAudioDurationFromBytes({
      bytes: pcmWavBytes(1),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects empty bytes", async () => {
    parseBufferMock.mockClear();
    const result = await probeAudioDurationFromBytes({
      bytes: new Uint8Array(),
    });
    expect(result.ok).toBe(false);
    expect(parseBufferMock).not.toHaveBeenCalled();
  });

  it("rejects malformed audio when parser throws", async () => {
    parseBufferMock.mockRejectedValueOnce(new Error("bad container"));
    const result = await probeAudioDurationFromBytes({
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    expect(result.ok).toBe(false);
  });
});

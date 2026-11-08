import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_MAX_BYTES } from "@/config/recording";
import { STUDIO_MAX_SONG_MS } from "@/config/studio";

import {
  createProjectBody,
  finalizeTakeBody,
  placeVocalBody,
  takeSessionBody,
} from "@/lib/recorder/desktop-upload-plan";
import { encodePcm16Wav, RECORDER_SAMPLE_RATE } from "@/lib/recorder/pcm-wav";

describe("desktop recorder wav", () => {
  it("writes a mono 16-bit WAV the take bucket already accepts", () => {
    const samples = Int16Array.from([0, 16000, -16000, 1]);
    const wav = encodePcm16Wav(samples, RECORDER_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(RECORDER_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16000);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
  });

  it("rejects an empty take and a file over the take cap", () => {
    expect(() => encodePcm16Wav(new Int16Array(), RECORDER_SAMPLE_RATE)).toThrow(/puste/);
    const tooBig = new Int16Array((TAKE_AUDIO_MAX_BYTES / 2) + 1);
    expect(() => encodePcm16Wav(tooBig, RECORDER_SAMPLE_RATE)).toThrow(/za duży/);
  });
});

describe("desktop upload plan", () => {
  it("uses the existing project, session, finalize and place bodies", () => {
    expect(createProjectBody(" Zwrotka ", "beat-1")).toEqual({
      title: "Zwrotka",
      beatId: "beat-1",
    });
    const samples = new Int16Array(RECORDER_SAMPLE_RATE);
    const wav = encodePcm16Wav(samples, RECORDER_SAMPLE_RATE);
    expect(takeSessionBody("beat-1", wav.byteLength)).toEqual({
      beatId: "beat-1",
      contentType: "audio/wav",
      byteSize: wav.byteLength,
    });
    expect(finalizeTakeBody("take-1")).toEqual({ takeId: "take-1" });
    expect(
      placeVocalBody({
        trackId: "track-vocal",
        takeId: "take-1",
        playheadMs: 1_000,
        samples,
        expectedDocumentVersion: 3,
      }),
    ).toEqual({
      trackId: "track-vocal",
      takeId: "take-1",
      timelineStartMs: 1_000,
      durationMs: 1_000,
      sourceOffsetMs: 0,
      expectedDocumentVersion: 3,
    });
    expect(STUDIO_MAX_SONG_MS).toBe(360_000);
  });
});

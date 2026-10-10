/**
 * I.45E — STUDIO_EXPORT PCM prepare / linear resample (local unit + light integration).
 * No DB, Storage, Contabo, worker process, or .env.local.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIO_CODEC } from "@/config/audio-render";
import { decodeRenderSourceToStereoPcm } from "@/lib/audio/render-decode";
import {
  StudioExportPcmPrepareError,
  toStudioExportRenderPcm,
} from "@/lib/audio/render-worker-pipeline";
import { encodeWavFromBake } from "@/lib/audio/wav-encode";
import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
} from "@/lib/studio/studio-offline-render";

const PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const TARGET = AUDIO_CODEC.WAV_SAMPLE_RATE;

function stereoPcm(params: {
  sampleRate: number;
  frames: number;
  fill: "silence" | "sine" | "hf" | "const";
  freqL?: number;
  freqR?: number;
  amp?: number;
}): DecodedPcmStereo {
  const amp = params.amp ?? 0.25;
  const interleaved = new Float32Array(params.frames * 2);
  if (params.fill === "silence") {
    // zeros
  } else if (params.fill === "const") {
    interleaved.fill(amp);
  } else {
    const fL = params.freqL ?? 440;
    const fR = params.freqR ?? 440;
    for (let i = 0; i < params.frames; i++) {
      const t = i / params.sampleRate;
      interleaved[i * 2] = Math.sin(2 * Math.PI * fL * t) * amp;
      interleaved[i * 2 + 1] = Math.sin(2 * Math.PI * fR * t) * amp;
    }
  }
  return {
    sampleRate: params.sampleRate,
    channels: 2,
    interleaved,
    frames: params.frames,
  };
}

function minimalWavPcm16Mono(sampleRate: number, seconds: number): Buffer {
  const n = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const s = Math.sin(2 * Math.PI * 220 * t) * 0.2;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), 44 + i * 2);
  }
  return data;
}

function track(
  partial: Partial<StudioEngineTrack> & Pick<StudioEngineTrack, "id">,
): StudioEngineTrack {
  return {
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...partial,
  };
}

function clip(
  partial: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: partial.sourceKind === "TAKE" ? "take-1" : null,
    sourceBeatId: partial.sourceKind === "BEAT_REF" ? "beat-1" : null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 100,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...partial,
  };
}

describe("I.45E STUDIO_EXPORT — pipeline wiring (source)", () => {
  const src = readFileSync(join(process.cwd(), PIPELINE), "utf8");

  it("calls toStudioExportRenderPcm after decode before pcm maps", () => {
    expect(src).toMatch(/toStudioExportRenderPcm/);
    expect(src).toMatch(/resampleStereoInterleaved/);
    expect(src).toMatch(/AUDIO_CODEC\.WAV_SAMPLE_RATE/);
    expect(src).toMatch(
      /pcmByTake\.set\(\s*takeId,\s*toStudioExportRenderPcm/,
    );
    expect(src).toMatch(
      /pcmByBeat\.set\(\s*beatId,\s*toStudioExportRenderPcm/,
    );
    expect(src).toMatch(/StudioExportPcmPrepareError/);
    expect(src).toMatch(/SOURCE_UNAVAILABLE/);
  });

  it("does not alter TAKE_EXPORT or MIX bake entry to use toStudioExportRenderPcm", () => {
    const studioStart = src.indexOf(
      "async function runClaimedStudioExportWorkerJob",
    );
    const takeStart = src.indexOf("async function runClaimedTakeExportWorkerJob");
    const basicStart = src.indexOf("async function runClaimedBasicMp3WorkerJob");
    const premiumStart = src.indexOf(
      "async function runClaimedPremiumWorkerJob",
    );
    expect(studioStart).toBeGreaterThan(-1);
    expect(takeStart).toBeGreaterThan(-1);
    expect(basicStart).toBeGreaterThan(-1);
    expect(premiumStart).toBeGreaterThan(-1);
    const takeSlice = src.slice(takeStart, basicStart);
    const basicSlice = src.slice(basicStart, premiumStart);
    const premiumSlice = src.slice(premiumStart);
    expect(takeSlice).not.toMatch(/toStudioExportRenderPcm/);
    expect(basicSlice).not.toMatch(/toStudioExportRenderPcm/);
    expect(premiumSlice).not.toMatch(/toStudioExportRenderPcm/);
  });
});

describe("I.45E toStudioExportRenderPcm — unit", () => {
  it("resamples stereo 48000 → WAV target 44100", () => {
    const src = stereoPcm({
      sampleRate: 48000,
      frames: 4800,
      fill: "sine",
      freqL: 220,
      freqR: 330,
    });
    const out = toStudioExportRenderPcm(src, "BEAT_REF:t");
    expect(out.sampleRate).toBe(TARGET);
    expect(out.channels).toBe(2);
    expect(out.interleaved).toBeInstanceOf(Float32Array);
    expect(out.interleaved.length).toBe(out.frames * 2);
    const expectedFrames = Math.max(1, Math.floor(4800 / (48000 / TARGET)));
    expect(out.frames).toBe(expectedFrames);
    const inDur = src.frames / src.sampleRate;
    const outDur = out.frames / out.sampleRate;
    expect(Math.abs(outDur - inDur)).toBeLessThan(2 / TARGET);
    expect(out.interleaved).not.toBe(src.interleaved);
  });

  it("identity path at 44100 — no unnecessary resample buffer", () => {
    const src = stereoPcm({
      sampleRate: TARGET,
      frames: 4410,
      fill: "sine",
    });
    const out = toStudioExportRenderPcm(src, "TAKE:t");
    expect(out).toBe(src);
    expect(out.sampleRate).toBe(TARGET);
    expect(out.frames).toBe(4410);
  });

  it("preserves silence energy near zero after 48k→44.1k", () => {
    const src = stereoPcm({
      sampleRate: 48000,
      frames: 4800,
      fill: "silence",
    });
    const out = toStudioExportRenderPcm(src, "BEAT_REF:silence");
    expect(out.sampleRate).toBe(TARGET);
    let peak = 0;
    for (let i = 0; i < out.interleaved.length; i++) {
      peak = Math.max(peak, Math.abs(out.interleaved[i]!));
    }
    expect(peak).toBe(0);
  });

  it("preserves sine energy after resample (finite, non-zero)", () => {
    const src = stereoPcm({
      sampleRate: 48000,
      frames: 9600,
      fill: "sine",
      freqL: 440,
      freqR: 440,
      amp: 0.3,
    });
    const out = toStudioExportRenderPcm(src, "TAKE:sine");
    let sumSq = 0;
    for (let i = 0; i < out.interleaved.length; i++) {
      const s = out.interleaved[i]!;
      expect(Number.isFinite(s)).toBe(true);
      sumSq += s * s;
    }
    expect(sumSq).toBeGreaterThan(0.01);
  });

  it("documents linear-resample HF aliasing limitation (no anti-alias claim)", () => {
    // 20 kHz at 48 kHz — above 44.1 Nyquist (~22.05k is limit; 20k is near edge).
    // Linear resample has no low-pass; we only assert finite output @ target rate.
    const src = stereoPcm({
      sampleRate: 48000,
      frames: 4800,
      fill: "hf",
      freqL: 20000,
      freqR: 20000,
      amp: 0.4,
    });
    const out = toStudioExportRenderPcm(src, "BEAT_REF:hf");
    expect(out.sampleRate).toBe(TARGET);
    for (let i = 0; i < Math.min(64, out.interleaved.length); i++) {
      expect(Number.isFinite(out.interleaved[i]!)).toBe(true);
    }
    // Explicit non-claim: this test does NOT assert alias suppression.
  });

  it("mono decode upmix then prepare → stereo @ target (decoder unchanged)", async () => {
    const bytes = new Uint8Array(minimalWavPcm16Mono(48000, 0.05));
    const decoded = await decodeRenderSourceToStereoPcm({
      bytes,
      contentType: "audio/wav",
      label: "beat",
    });
    expect(decoded.channels).toBe(2);
    expect(decoded.sampleRate).toBe(48000);
    const prepared = toStudioExportRenderPcm(decoded, "BEAT_REF:mono");
    expect(prepared.sampleRate).toBe(TARGET);
    expect(prepared.channels).toBe(2);
    expect(prepared.interleaved.length).toBe(prepared.frames * 2);
  });

  it("rejects NaN / Infinity / zero / negative sampleRate", () => {
    for (const rate of [Number.NaN, Number.POSITIVE_INFINITY, 0, -44100]) {
      const src = stereoPcm({
        sampleRate: TARGET,
        frames: 100,
        fill: "silence",
      });
      src.sampleRate = rate;
      expect(() => toStudioExportRenderPcm(src, "TAKE:bad-rate")).toThrow(
        StudioExportPcmPrepareError,
      );
    }
  });

  it("rejects extreme low rate that would project unsafe allocation", () => {
    // 1 Hz × many frames → projected out frames >> 180s @ 44100.
    const src = stereoPcm({
      sampleRate: 1,
      frames: 10_000,
      fill: "silence",
    });
    expect(() => toStudioExportRenderPcm(src, "TAKE:tiny-rate")).toThrow(
      /duration|projected resample frames|safe max/i,
    );
  });

  it("rejects invalid frames / buffer length / non-finite samples", () => {
    const base = stereoPcm({
      sampleRate: TARGET,
      frames: 100,
      fill: "const",
    });

    expect(() =>
      toStudioExportRenderPcm({ ...base, frames: 0 }, "TAKE:z"),
    ).toThrow(StudioExportPcmPrepareError);

    expect(() =>
      toStudioExportRenderPcm(
        { ...base, interleaved: new Float32Array(10) },
        "TAKE:len",
      ),
    ).toThrow(StudioExportPcmPrepareError);

    const nanBuf = new Float32Array(base.interleaved);
    nanBuf[0] = Number.NaN;
    expect(() =>
      toStudioExportRenderPcm({ ...base, interleaved: nanBuf }, "TAKE:nan"),
    ).toThrow(StudioExportPcmPrepareError);

    const infBuf = new Float32Array(base.interleaved);
    infBuf[1] = Number.POSITIVE_INFINITY;
    expect(() =>
      toStudioExportRenderPcm({ ...base, interleaved: infBuf }, "TAKE:inf"),
    ).toThrow(StudioExportPcmPrepareError);
  });

  it("rejects wrong channel count", () => {
    const src = stereoPcm({
      sampleRate: TARGET,
      frames: 10,
      fill: "silence",
    });
    expect(() =>
      toStudioExportRenderPcm(
        { ...src, channels: 1 as 2 },
        "TAKE:ch",
      ),
    ).toThrow(StudioExportPcmPrepareError);
  });
});

describe("I.45E STUDIO_EXPORT — prepare → offline → WAV QC", () => {
  it("48 kHz source through prepare + offline render encodes WAV @ 44100", async () => {
    const raw = stereoPcm({
      sampleRate: 48000,
      frames: 4800,
      fill: "sine",
      freqL: 440,
      freqR: 440,
      amp: 0.2,
    });
    const prepared = toStudioExportRenderPcm(raw, "BEAT_REF:beat-1");
    expect(prepared.sampleRate).toBe(STUDIO_OFFLINE_RENDER_SAMPLE_RATE);

    const document: StudioEngineDocument = {
      timelineLengthMs: 100,
      masterGainDb: 0,
      masterPan: 0,
      projectBeatId: "beat-1",
      tracks: [track({ id: "tr-1" })],
      clips: [
        clip({
          id: "c-1",
          trackId: "tr-1",
          sourceKind: "BEAT_REF",
          sourceBeatId: "beat-1",
          durationMs: 100,
        }),
      ],
    };

    const offline = await renderStudioDocumentOffline({
      document,
      resolvePcm: (key) =>
        key.kind === "BEAT_REF" && key.beatId === "beat-1" ? prepared : null,
      exportDurationMs: 100,
    });
    expect(offline.sampleRate).toBe(TARGET);

    const encoded = await encodeWavFromBake({
      interleaved: offline.interleaved,
      sampleRate: offline.sampleRate,
      channels: 2,
      frames: offline.frames,
      durationMs: Math.max(
        1,
        Math.round((offline.frames / offline.sampleRate) * 1000),
      ),
    });
    expect(encoded.sampleRate).toBe(TARGET);
    expect(encoded.contentType).toBe("audio/wav");
  });
});

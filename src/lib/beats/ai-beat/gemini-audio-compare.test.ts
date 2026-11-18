import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMPARE_AUDIO_SECONDS,
  prepareBeatAudioForGemini,
  reviseBriefFromVideo,
  trimWavToSeconds,
  uploadAudioToGemini,
} from "@/lib/beats/ai-beat/gemini-audio-compare";
import type { BeatStyleFromYouTube } from "@/lib/beats/ai-beat/youtube-style";

const FS = 8000;

/** 16-bit mono PCM WAV of `seconds`, with a LIST chunk after the data to prove it is dropped. */
function wav(seconds: number): Uint8Array {
  const data = FS * 2 * seconds;
  const bytes = new Uint8Array(44 + data + 12);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, FS, true);
  v.setUint32(28, FS * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, data, true);
  tag(44 + data, "LIST");
  v.setUint32(48 + data, 4, true);
  return bytes;
}

const brief: BeatStyleFromYouTube = {
  style: "trap",
  opis: "Opis testowy beatu.",
  prompt: "171 BPM. Key: D minor. Hard kick.",
  bpmHint: 171,
};

describe("trimWavToSeconds", () => {
  it("cuts the data chunk and fixes both sizes", () => {
    const src = wav(10);
    const out = trimWavToSeconds(src, 4);
    expect(out.trimmed).toBe(true);
    expect(out.bytes.byteLength).toBe(44 + FS * 2 * 4);
    const v = new DataView(out.bytes.buffer);
    expect(v.getUint32(40, true)).toBe(FS * 2 * 4);
    expect(v.getUint32(4, true)).toBe(out.bytes.byteLength - 8);
  });

  it("leaves a short file and non-WAV bytes alone", () => {
    const short = wav(2);
    expect(trimWavToSeconds(short, 4)).toEqual({ bytes: short, trimmed: false });
    const junk = new Uint8Array(100).fill(3);
    expect(trimWavToSeconds(junk, 4)).toEqual({ bytes: junk, trimmed: false });
  });
});

function filesFetch(opts: { state?: string[]; startStatus?: number } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const states = [...(opts.state ?? ["ACTIVE"])];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/upload/v1beta/files")) {
      if (opts.startStatus) return new Response("no", { status: opts.startStatus });
      return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/session1" } });
    }
    if (u === "https://upload.example/session1") {
      return new Response(
        JSON.stringify({ file: { name: "files/abc", uri: "https://gl/files/abc", mime_type: "audio/wav", state: states.shift() ?? "ACTIVE" } }),
        { status: 200 },
      );
    }
    if (init?.method === "DELETE") return new Response("{}", { status: 200 });
    return new Response(
      JSON.stringify({ name: "files/abc", uri: "https://gl/files/abc", mime_type: "audio/wav", state: states.shift() ?? "ACTIVE" }),
      { status: 200 },
    );
  });
  return { fn: fn as unknown as typeof fetch, calls, mock: fn };
}

describe("uploadAudioToGemini", () => {
  it("does the two-step resumable upload with the documented headers", async () => {
    const { fn, calls } = filesFetch();
    const ref = await uploadAudioToGemini({
      bytes: new Uint8Array(1000),
      mimeType: "audio/wav",
      displayName: "generated-beat",
      apiKey: "k",
      fetchFn: fn,
    });
    expect(ref).toEqual({ uri: "https://gl/files/abc", mimeType: "audio/wav", name: "files/abc" });
    const start = calls[0]!.init!.headers as Record<string, string>;
    expect(start["X-Goog-Upload-Protocol"]).toBe("resumable");
    expect(start["X-Goog-Upload-Command"]).toBe("start");
    expect(start["X-Goog-Upload-Header-Content-Length"]).toBe("1000");
    expect(start["X-Goog-Upload-Header-Content-Type"]).toBe("audio/wav");
    expect(start["x-goog-api-key"]).toBe("k");
    expect(JSON.parse(String(calls[0]!.init!.body)).file.display_name).toBe("generated-beat");
    const up = calls[1]!.init!.headers as Record<string, string>;
    expect(up["X-Goog-Upload-Command"]).toBe("upload, finalize");
    expect(up["X-Goog-Upload-Offset"]).toBe("0");
  });

  it("waits while the file is PROCESSING", async () => {
    vi.useFakeTimers();
    const { fn, calls } = filesFetch({ state: ["PROCESSING", "PROCESSING", "ACTIVE"] });
    const pending = uploadAudioToGemini({ bytes: new Uint8Array(10), mimeType: "audio/wav", displayName: "x", apiKey: "k", fetchFn: fn });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ uri: "https://gl/files/abc" });
    expect(calls.filter((c) => c.url.includes("/v1beta/files/abc")).length).toBe(2);
  });

  it("throws when the start request is refused", async () => {
    const { fn } = filesFetch({ startStatus: 403 });
    await expect(
      uploadAudioToGemini({ bytes: new Uint8Array(10), mimeType: "audio/wav", displayName: "x", apiKey: "k", fetchFn: fn }),
    ).rejects.toThrow(/403/);
  });
});

describe("prepareBeatAudioForGemini", () => {
  afterEach(() => vi.useRealTimers());

  it("needs a Gemini key", async () => {
    await expect(prepareBeatAudioForGemini("b", { env: {} })).rejects.toThrow(/no gemini key/);
  });

  it("uploads only the first minute and deletes the file on cleanup, once", async () => {
    const { fn, calls } = filesFetch();
    const full = wav(Math.ceil(COMPARE_AUDIO_SECONDS) + 20);
    const prepared = await prepareBeatAudioForGemini("beat-1", {
      env: { GEMINI_API_KEY: "k" },
      fetchFn: fn,
      loadMaster: async () => ({ bytes: full, contentType: "audio/wav" }),
    });
    const startHeaders = calls[0]!.init!.headers as Record<string, string>;
    expect(Number(startHeaders["X-Goog-Upload-Header-Content-Length"])).toBe(44 + FS * 2 * COMPARE_AUDIO_SECONDS);
    await prepared.cleanup();
    await prepared.cleanup();
    expect(calls.filter((c) => c.init?.method === "DELETE")).toHaveLength(1);
  });
});

describe("reviseBriefFromVideo", () => {
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const base = { beatId: "b", youtubeUrl: url, previousBrief: "old", note: "more energy" };
  const ref = { uri: "https://gl/files/abc", mimeType: "audio/wav", name: "files/abc" };

  function deps(over: Record<string, unknown> = {}) {
    const cleanup = vi.fn(async () => undefined);
    const prepare = vi.fn(async () => ({ ref, cleanup }));
    const describe_ = vi.fn(async () => brief);
    return { cleanup, prepare, describe: describe_, d: { prepare, describe: describe_, now: () => 1000, ...over } };
  }

  it("sends the audio reference to Gemini and cleans up", async () => {
    const x = deps();
    const out = await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: x.d as never });
    expect(out).toEqual({ brief, usedAudio: true });
    expect(x.describe).toHaveBeenCalledTimes(1);
    const [, , revision] = x.describe.mock.calls[0] as unknown as [string, unknown, { audio?: unknown; note: string }];
    expect(revision.audio).toEqual({ uri: ref.uri, mimeType: ref.mimeType });
    expect(revision.note).toBe("more energy");
    expect(x.cleanup).toHaveBeenCalledTimes(1);
  });

  it("falls back to the video-only revision when the upload fails", async () => {
    const x = deps({ prepare: vi.fn(async () => { throw new Error("upload 500"); }) });
    const out = await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: x.d as never });
    expect(out).toEqual({ brief, usedAudio: false });
    const [, , revision] = x.describe.mock.calls[0] as unknown as [string, unknown, { audio?: unknown }];
    expect(revision.audio).toBeUndefined();
  });

  it("falls back, and still cleans up, when the audio comparison fails", async () => {
    const x = deps();
    x.describe.mockRejectedValueOnce(new Error("timeout"));
    const out = await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: x.d as never });
    expect(out).toEqual({ brief, usedAudio: false });
    expect(x.describe).toHaveBeenCalledTimes(2);
    expect(x.cleanup).toHaveBeenCalledTimes(1);
  });

  it("skips the audio step when there is no time for it", async () => {
    const x = deps({ now: () => 1000 + 200_000 });
    const out = await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: x.d as never });
    expect(x.prepare).not.toHaveBeenCalled();
    expect(out).toEqual({ brief, usedAudio: false });
  });

  it("returns null when neither attempt works, or when no time is left", async () => {
    const x = deps();
    x.describe.mockRejectedValue(new Error("down"));
    expect(await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: x.d as never })).toBeNull();
    const late = deps({ now: () => 1000 + 270_000 });
    expect(await reviseBriefFromVideo({ ...base, startedAt: 1000, deps: late.d as never })).toBeNull();
    expect(late.describe).not.toHaveBeenCalled();
  });
});

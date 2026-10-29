/** Pure helpers shared by the E3 mix render (server-render.ts) and its parity test. */
import type { MixAnalysisSource } from "@/lib/studio/mix-analysis/render";

/**
 * ffmpeg: any source → float32 WAV at `sampleRate`, keeping the native channel count.
 * No `-ac 2`: ffmpeg's mono→stereo upmix is −3 dB, while the browser's decodeAudioData
 * keeps mono as one channel at 0 dB — parity requires the native layout.
 */
export function ffmpegDecodeArgs(src: string, out: string, sampleRate: number): string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ar", String(sampleRate), "-c:a", "pcm_f32le", "-f", "wav", out];
}

/** Parse ffmpeg's float32 WAV into planar channels (like AudioBuffer). >2 channels → first two. */
/** `shared` = channels backed by SharedArrayBuffer (handed to render threads without copying). */
export function parseDecodedWav(buf: Buffer, shared = false): MixAnalysisSource {
  let off = 12; let channels = 0; let fmt = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4); let size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") { fmt = buf.readUInt16LE(off + 8); channels = buf.readUInt16LE(off + 10); if (fmt === 0xfffe) fmt = buf.readUInt16LE(off + 32); }
    if (id === "data") {
      if (fmt !== 3 || channels < 1) throw new Error("decode_format");
      if (size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8;
      const f = new Float32Array(buf.buffer.slice(buf.byteOffset + off + 8, buf.byteOffset + off + 8 + size - (size % 4)));
      const frames = Math.floor(f.length / channels); const keep = Math.min(channels, 2);
      const out: Float32Array[] = [];
      for (let c = 0; c < keep; c++) { const ch = shared ? new Float32Array(new SharedArrayBuffer(frames * 4)) : new Float32Array(frames); for (let i = 0; i < frames; i++) ch[i] = f[i * channels + c]!; out.push(ch); }
      return { channels: out };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("decode_format");
}

/** Stem file name inside the Projekt zip: NN-safe-name.wav. */
export function stemFileName(index: number, trackName: string): string {
  const slug = trackName.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${String(index).padStart(2, "0")}-${slug || "track"}.wav`;
}

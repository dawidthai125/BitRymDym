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

/** Stable ZIP sort: lead → doubles/adlibs → beat → rest (hip-hop pack). */
export const STEM_ROLE_SORT: Record<string, number> = {
  lead_vocal: 10,
  double: 20,
  adlib: 30,
  backing: 40,
  beat: 50,
  instrument: 60,
  other: 90,
};

export function stemRoleSortKey(role: string | undefined): number {
  if (!role) return 80;
  return STEM_ROLE_SORT[role] ?? 80;
}

function slugPart(raw: string, max: number): string {
  return raw
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/**
 * Stem file name inside the Projekt zip:
 * `NN-role-name.wav` or `NN-role-name-mix.wav` (role omitted when empty).
 */
export function stemFileName(
  index: number,
  trackName: string,
  kind: "dry" | "mix" = "dry",
  role?: string,
): string {
  const roleSlug = role ? slugPart(role, 24) : "";
  const nameSlug = slugPart(trackName, 40) || "track";
  const base = roleSlug
    ? `${String(index).padStart(2, "0")}-${roleSlug}-${nameSlug}`
    : `${String(index).padStart(2, "0")}-${nameSlug}`;
  return kind === "mix" ? `${base}-mix.wav` : `${base}.wav`;
}

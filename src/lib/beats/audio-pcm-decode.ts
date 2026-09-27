import "server-only";

/**
 * Decode uploaded audio bytes to mono PCM for BPM analysis.
 * No ffmpeg. WAV + MP3 via `audio-decode`. FLAC/AAC/M4A → unavailable.
 */

export const BPM_DECODE_SUPPORTED_MIME = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
] as const;

export type PcmDecodeResult =
  | {
      ok: true;
      samples: Float32Array;
      sampleRate: number;
      channels: number;
    }
  | { ok: false; reason: "unsupported_format" | "decode_failed"; message: string };

export function isBpmDecodeSupportedMime(contentType: string): boolean {
  return (BPM_DECODE_SUPPORTED_MIME as readonly string[]).includes(contentType);
}

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) {
    return channelData[0]!;
  }
  const length = channelData[0]!.length;
  const mono = new Float32Array(length);
  const n = channelData.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) {
      sum += channelData[c]![i] ?? 0;
    }
    mono[i] = sum / n;
  }
  return mono;
}

export async function decodeAudioToMonoPcm(params: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<PcmDecodeResult> {
  if (!isBpmDecodeSupportedMime(params.contentType)) {
    return {
      ok: false,
      reason: "unsupported_format",
      message:
        "Automatyczne wykrywanie BPM dla tego formatu jest niedostępne.",
    };
  }

  try {
    const decode = (await import("audio-decode")).default;
    const audio = await decode(
      Buffer.from(
        params.bytes.buffer,
        params.bytes.byteOffset,
        params.bytes.byteLength,
      ),
    );

    const sampleRate = audio.sampleRate;
    const channelData = audio.channelData as Float32Array[] | undefined;
    if (
      typeof sampleRate !== "number" ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0 ||
      !channelData?.length ||
      !channelData[0]?.length
    ) {
      return {
        ok: false,
        reason: "decode_failed",
        message: "Nie udało się zdekodować audio do PCM.",
      };
    }

    return {
      ok: true,
      samples: mixToMono(channelData),
      sampleRate,
      channels: channelData.length,
    };
  } catch {
    return {
      ok: false,
      reason: "decode_failed",
      message: "Nie udało się zdekodować audio do PCM.",
    };
  }
}

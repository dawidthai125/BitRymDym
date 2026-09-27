/**
 * Detect EBML/WebM containers that music-metadata often cannot duration-probe
 * when Chromium MediaRecorder omits Segment Info.Duration (esp. timesliced).
 */
export function isLikelyEbmlWebmContainer(params: {
  bytes: Uint8Array;
  contentTypeHint?: string | null;
}): boolean {
  const hint = (params.contentTypeHint ?? "").toLowerCase();
  if (
    hint.includes("webm") ||
    hint.includes("matroska") ||
    hint.includes("audio/ogg") ||
    hint === "audio/opus"
  ) {
    return true;
  }

  const b = params.bytes;
  // EBML header ID: 0x1A45DFA3
  return (
    b.length >= 4 &&
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3
  );
}

/**
 * Server-side duration from decoded PCM (sample count / sampleRate).
 * Used only as fallback when container metadata lacks duration.
 * Does NOT trust client-supplied duration.
 */
export async function probeDurationSecondsViaAudioDecode(
  bytes: Uint8Array,
): Promise<number | null> {
  if (!bytes.length) return null;

  try {
    const decode = (await import("audio-decode")).default;
    const audio = await decode(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );

    const sampleRate = audio.sampleRate;
    const channel0 = audio.channelData?.[0];
    if (
      typeof sampleRate !== "number" ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0 ||
      !channel0 ||
      channel0.length <= 0
    ) {
      return null;
    }

    const raw = channel0.length / sampleRate;
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  } catch {
    return null;
  }
}

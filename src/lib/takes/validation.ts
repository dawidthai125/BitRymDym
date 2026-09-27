import {
  TAKE_AUDIO_INTERIM_MIME_ALLOWLIST,
  TAKE_AUDIO_MAX_BYTES,
} from "@/config/recording";

/** Normalize MediaRecorder types like audio/webm;codecs=opus → audio/webm */
export function normalizeTakeContentType(raw: string): string | null {
  const base = raw.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (
    (TAKE_AUDIO_INTERIM_MIME_ALLOWLIST as readonly string[]).includes(base)
  ) {
    return base;
  }
  return null;
}

export function validateTakeUploadMeta(params: {
  contentType: string;
  byteSize: number;
}): { ok: true; contentType: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const contentType = normalizeTakeContentType(params.contentType);
  if (!contentType) {
    errors.push("contentType is not in take interim allow-list");
  }
  if (
    typeof params.byteSize !== "number" ||
    !Number.isInteger(params.byteSize) ||
    params.byteSize <= 0
  ) {
    errors.push("byteSize must be a positive integer");
  } else if (params.byteSize > TAKE_AUDIO_MAX_BYTES) {
    errors.push(`byteSize must be at most ${TAKE_AUDIO_MAX_BYTES}`);
  }
  if (errors.length > 0 || !contentType) {
    return { ok: false, errors };
  }
  return { ok: true, contentType };
}

/** Prefer MediaRecorder MIME in order; return null if none supported. */
export function pickSupportedMediaRecorderMime(
  isTypeSupported: (type: string) => boolean,
): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of candidates) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return null;
}

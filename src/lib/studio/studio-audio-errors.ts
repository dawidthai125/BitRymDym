/**
 * P5.10 StudioAudioEngine error codes — distinct from P5.8 DEVICE_* codes.
 * Diagnostic code is the contract; user-facing copy is Polish and stable.
 */

export const STUDIO_AUDIO_ERROR_CODES = [
  "AUDIO_CONTEXT_UNAVAILABLE",
  "AUDIO_SOURCE_UNAVAILABLE",
  "AUDIO_DECODE_FAILED",
  "AUDIO_PLAYBACK_FAILED",
  "AUDIO_SYNC_FAILED",
  "AUDIO_OUTPUT_ERROR",
  "AUDIO_FX_UNKNOWN_TYPE",
  "AUDIO_FX_INVALID_PARAMS",
  "AUDIO_FX_CHAIN_UNSUPPORTED",
  "AUDIO_FX_NODE_FAILED",
] as const;

export type StudioAudioErrorCode = (typeof STUDIO_AUDIO_ERROR_CODES)[number];

const USER_FACING_PL: Record<StudioAudioErrorCode, string> = {
  AUDIO_CONTEXT_UNAVAILABLE:
    "Nie udało się uruchomić odtwarzania. Kliknij Odtwórz, aby spróbować ponownie.",
  AUDIO_SOURCE_UNAVAILABLE:
    "Nie udało się odtworzyć źródła audio. Sprawdź połączenie lub spróbuj ponownie.",
  AUDIO_DECODE_FAILED:
    "Nie udało się odtworzyć źródła audio. Sprawdź połączenie lub spróbuj ponownie.",
  AUDIO_PLAYBACK_FAILED:
    "Nie udało się odtworzyć audio. Sprawdź połączenie lub spróbuj ponownie.",
  AUDIO_SYNC_FAILED:
    "Odtwarzanie straciło synchronizację. Spróbuj ponownie.",
  AUDIO_OUTPUT_ERROR:
    "Nie udało się odtworzyć audio. Sprawdź połączenie lub spróbuj ponownie.",
  AUDIO_FX_UNKNOWN_TYPE:
    "Pominięto nieobsługiwany efekt. Pozostałe ścieżki grają dalej.",
  AUDIO_FX_INVALID_PARAMS:
    "Pominięto efekt z niepoprawnymi parametrami. Pozostałe ścieżki grają dalej.",
  AUDIO_FX_CHAIN_UNSUPPORTED:
    "Łańcuch efektów nie jest obsługiwany. Ścieżka gra bez efektów.",
  AUDIO_FX_NODE_FAILED:
    "Nie udało się wstawić efektu. Ścieżka gra dalej.",
};

/** Beat-specific copy kept from P5.2. */
export const STUDIO_BEAT_PLAYBACK_ERROR_PL =
  "Nie udało się odtworzyć bitu. Sprawdź połączenie lub spróbuj ponownie.";

/** Take-specific copy kept from P5.5/P5.6. */
export const STUDIO_TAKE_PLAYBACK_ERROR_PL =
  "Nie udało się odtworzyć nagrania. Sprawdź połączenie lub spróbuj ponownie.";

export function isStudioAudioErrorCode(
  value: string,
): value is StudioAudioErrorCode {
  return (STUDIO_AUDIO_ERROR_CODES as readonly string[]).includes(value);
}

export function labelStudioAudioError(code: StudioAudioErrorCode): string {
  return USER_FACING_PL[code];
}

export function userFacingPlaybackError(params: {
  code: StudioAudioErrorCode;
  sourceKind?: string;
}): string {
  if (params.code === "AUDIO_SOURCE_UNAVAILABLE") {
    if (params.sourceKind === "BEAT_REF") return STUDIO_BEAT_PLAYBACK_ERROR_PL;
    if (params.sourceKind === "TAKE") return STUDIO_TAKE_PLAYBACK_ERROR_PL;
  }
  if (params.code === "AUDIO_PLAYBACK_FAILED") {
    if (params.sourceKind === "BEAT_REF") return STUDIO_BEAT_PLAYBACK_ERROR_PL;
    if (params.sourceKind === "TAKE") return STUDIO_TAKE_PLAYBACK_ERROR_PL;
  }
  return labelStudioAudioError(params.code);
}

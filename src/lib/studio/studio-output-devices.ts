/**
 * AUD-01 — Studio output device helpers (feature-detected setSinkId only).
 * Never invent a fake output list when the browser cannot route audio.
 */

export const STUDIO_AUDIO_OUTPUT_STORAGE_KEY =
  "bitrymdym.studio.selectedAudioOutputDeviceId";

export type StudioAudioOutputOption = {
  deviceId: string;
  label: string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type DeviceInfoLike = {
  deviceId: string;
  kind: string;
  label: string;
};

/** True when AudioContext.setSinkId exists (typically Chromium desktop). */
export function supportsAudioContextSetSinkId(
  AudioContextCtor?: (new () => unknown) | null,
): boolean {
  if (AudioContextCtor) {
    const proto = AudioContextCtor.prototype as { setSinkId?: unknown };
    return typeof proto.setSinkId === "function";
  }
  if (typeof window === "undefined") return false;
  const Ctor =
    window.AudioContext ||
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) return false;
  return typeof (
    Ctor.prototype as unknown as { setSinkId?: unknown }
  ).setSinkId === "function";
}

/**
 * Mobile / coarse pointer → Automatic only (no manual output picker).
 * Desktop + setSinkId support → picker allowed.
 */
export function shouldShowStudioOutputPicker(params?: {
  supportsSetSinkId?: boolean;
  isMobileLike?: boolean;
}): boolean {
  const supports =
    params?.supportsSetSinkId ?? supportsAudioContextSetSinkId();
  const mobile =
    params?.isMobileLike ??
    (typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px), (pointer: coarse)").matches
      : false);
  return supports && !mobile;
}

export function mapMediaDevicesToAudioOutputs(
  devices: readonly DeviceInfoLike[],
): StudioAudioOutputOption[] {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  return outputs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label.trim() ? d.label : `Odsłuch ${i + 1}`,
  }));
}

export function resolveSelectedOutputDeviceId(params: {
  preferredId: string | null;
  outputs: readonly StudioAudioOutputOption[];
}): { selectedId: string | null; fellBackFromStale: boolean } {
  const preferred =
    params.preferredId && params.preferredId.trim()
      ? params.preferredId.trim()
      : null;

  if (preferred == null) {
    return { selectedId: null, fellBackFromStale: false };
  }

  if (params.outputs.some((d) => d.deviceId === preferred)) {
    return { selectedId: preferred, fellBackFromStale: false };
  }

  return { selectedId: null, fellBackFromStale: true };
}

export function readStoredAudioOutputDeviceId(
  storage: StorageLike | null | undefined,
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDIO_AUDIO_OUTPUT_STORAGE_KEY);
    if (raw == null || raw.trim() === "") return null;
    return raw.trim();
  } catch {
    return null;
  }
}

export function writeStoredAudioOutputDeviceId(
  storage: StorageLike | null | undefined,
  deviceId: string | null,
): void {
  if (!storage) return;
  try {
    if (deviceId == null || deviceId.trim() === "") {
      storage.removeItem(STUDIO_AUDIO_OUTPUT_STORAGE_KEY);
      return;
    }
    storage.setItem(STUDIO_AUDIO_OUTPUT_STORAGE_KEY, deviceId.trim());
  } catch {
    // private mode / quota
  }
}

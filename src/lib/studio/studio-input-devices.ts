/**
 * P5.8 — Studio input / device foundation (pure helpers).
 * Browser deviceId is untrusted tech data — never send to backend.
 */

export const STUDIO_AUDIO_INPUT_STORAGE_KEY =
  "bitrymdym.studio.selectedAudioInputDeviceId";

export type StudioMicPermissionState =
  | "UNKNOWN"
  | "REQUESTING"
  | "GRANTED"
  | "DENIED"
  | "BLOCKED"
  | "UNAVAILABLE";

export type StudioDeviceErrorCode =
  | "DEVICE_PERMISSION_DENIED"
  | "DEVICE_PERMISSION_BLOCKED"
  | "NO_INPUT_DEVICE"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_DISCONNECTED"
  | "DEVICE_SELECTION_FAILED"
  | "INPUT_STREAM_FAILED";

export type StudioAudioInputOption = {
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

/** Filter + label fallback for audioinput devices. */
export function mapMediaDevicesToAudioInputs(
  devices: readonly DeviceInfoLike[],
): StudioAudioInputOption[] {
  const inputs = devices.filter((d) => d.kind === "audioinput");
  return inputs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label.trim() ? d.label : `Mikrofon ${i + 1}`,
  }));
}

/**
 * Resolve selection: null / empty = Automatic (system default mic).
 * Stale preferred id → Automatic (null) + fellBackFromStale.
 * AUD-01: do not force-first-device when user wants Automatic.
 */
export function resolveSelectedInputDeviceId(params: {
  preferredId: string | null;
  inputs: readonly StudioAudioInputOption[];
}): { selectedId: string | null; fellBackFromStale: boolean } {
  const preferred =
    params.preferredId && params.preferredId.trim()
      ? params.preferredId.trim()
      : null;

  if (preferred == null) {
    return { selectedId: null, fellBackFromStale: false };
  }

  if (params.inputs.length === 0) {
    return {
      selectedId: null,
      fellBackFromStale: true,
    };
  }

  if (params.inputs.some((d) => d.deviceId === preferred)) {
    return { selectedId: preferred, fellBackFromStale: false };
  }

  return {
    selectedId: null,
    fellBackFromStale: true,
  };
}

export function readStoredAudioInputDeviceId(
  storage: StorageLike | null | undefined,
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDIO_AUDIO_INPUT_STORAGE_KEY);
    if (raw == null || raw.trim() === "") return null;
    return raw.trim();
  } catch {
    return null;
  }
}

export function writeStoredAudioInputDeviceId(
  storage: StorageLike | null | undefined,
  deviceId: string | null,
): void {
  if (!storage) return;
  try {
    if (deviceId == null || deviceId.trim() === "") {
      storage.removeItem(STUDIO_AUDIO_INPUT_STORAGE_KEY);
      return;
    }
    storage.setItem(STUDIO_AUDIO_INPUT_STORAGE_KEY, deviceId.trim());
  } catch {
    // private mode / quota — ignore
  }
}

export function studioDeviceErrorMessagePl(code: StudioDeviceErrorCode): string {
  switch (code) {
    case "DEVICE_PERMISSION_DENIED":
      return "Nie przyznano dostępu do mikrofonu.";
    case "DEVICE_PERMISSION_BLOCKED":
      return "Dostęp do mikrofonu jest zablokowany w przeglądarce. Sprawdź ustawienia witryny.";
    case "NO_INPUT_DEVICE":
      return "Nie znaleziono mikrofonu.";
    case "DEVICE_NOT_FOUND":
      return "Wybrany mikrofon jest niedostępny. Użyto domyślnego urządzenia.";
    case "DEVICE_DISCONNECTED":
      return "Mikrofon został odłączony podczas nagrywania.";
    case "DEVICE_SELECTION_FAILED":
      return "Nie udało się użyć wybranego mikrofonu.";
    case "INPUT_STREAM_FAILED":
      return "Nie udało się uruchomić mikrofonu.";
  }
}

export function mapGetUserMediaFailure(error: unknown): {
  code: StudioDeviceErrorCode;
  permission: StudioMicPermissionState;
} {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: string }).name)
      : "";

  if (name === "SecurityError") {
    return {
      code: "DEVICE_PERMISSION_BLOCKED",
      permission: "BLOCKED",
    };
  }
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError"
  ) {
    return {
      code: "DEVICE_PERMISSION_DENIED",
      permission: "DENIED",
    };
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError"
  ) {
    return {
      code: "NO_INPUT_DEVICE",
      permission: "UNAVAILABLE",
    };
  }
  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return {
      code: "DEVICE_SELECTION_FAILED",
      permission: "GRANTED",
    };
  }
  return {
    code: "INPUT_STREAM_FAILED",
    permission: "UNKNOWN",
  };
}

/** Constraints for preferred device; null/empty → system default. */
export function buildAudioTrackConstraints(
  selectedDeviceId: string | null,
): MediaTrackConstraints | true {
  if (!selectedDeviceId || selectedDeviceId.trim() === "") {
    return true;
  }
  // Prefer ideal over exact so stale ids can soft-fail into browser choice.
  return { deviceId: { ideal: selectedDeviceId.trim() } };
}

export type AcquireMicStreamResult =
  | {
      ok: true;
      stream: MediaStream;
      usedDeviceId: string | null;
      fellBack: boolean;
    }
  | {
      ok: false;
      code: StudioDeviceErrorCode;
      permission: StudioMicPermissionState;
    };

type GetUserMediaFn = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

/**
 * Open a mic stream with preferred device, falling back to default on constraint/not-found.
 * Caller owns stopping tracks (probe) or handing stream to TakeMediaRecorder.
 */
export async function acquireMicStream(params: {
  getUserMedia: GetUserMediaFn;
  preferredDeviceId: string | null;
}): Promise<AcquireMicStreamResult> {
  const preferred =
    params.preferredDeviceId && params.preferredDeviceId.trim()
      ? params.preferredDeviceId.trim()
      : null;

  const tryOnce = async (
    deviceId: string | null,
  ): Promise<MediaStream> => {
    const audio = buildAudioTrackConstraints(deviceId);
    return params.getUserMedia({ audio, video: false });
  };

  try {
    const stream = await tryOnce(preferred);
    const track = stream.getAudioTracks()[0];
    const settingsId =
      typeof track?.getSettings === "function"
        ? (track.getSettings().deviceId ?? null)
        : null;
    return {
      ok: true,
      stream,
      usedDeviceId: settingsId ?? preferred,
      fellBack: false,
    };
  } catch (firstError) {
    const mapped = mapGetUserMediaFailure(firstError);
    if (
      preferred &&
      (mapped.code === "DEVICE_SELECTION_FAILED" ||
        mapped.code === "NO_INPUT_DEVICE" ||
        mapped.code === "DEVICE_NOT_FOUND")
    ) {
      try {
        const stream = await tryOnce(null);
        const track = stream.getAudioTracks()[0];
        const settingsId =
          typeof track?.getSettings === "function"
            ? (track.getSettings().deviceId ?? null)
            : null;
        return {
          ok: true,
          stream,
          usedDeviceId: settingsId,
          fellBack: true,
        };
      } catch (secondError) {
        return { ok: false, ...mapGetUserMediaFailure(secondError) };
      }
    }
    return { ok: false, ...mapped };
  }
}

export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

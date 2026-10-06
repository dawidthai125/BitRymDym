"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  acquireMicStream,
  mapMediaDevicesToAudioInputs,
  readStoredAudioInputDeviceId,
  resolveSelectedInputDeviceId,
  stopMediaStreamTracks,
  studioDeviceErrorMessagePl,
  writeStoredAudioInputDeviceId,
  type StudioAudioInputOption,
  type StudioDeviceErrorCode,
  type StudioMicPermissionState,
} from "@/lib/studio/studio-input-devices";

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * P5.8 Studio device/input layer — separate from reduceRecordingUi.
 * Does not own TakeMediaRecorder capture lifecycle.
 */
export function useStudioInputDevices(options?: {
  /** When true, devicechange only refreshes list — never interrupts capture. */
  recordingActive?: boolean;
}) {
  const recordingActive = options?.recordingActive ?? false;
  const recordingActiveRef = useRef(false);
  const selectedRef = useRef<string | null>(null);

  const [inputs, setInputs] = useState<StudioAudioInputOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
    () => readStoredAudioInputDeviceId(browserLocalStorage()),
  );
  const [permission, setPermission] =
    useState<StudioMicPermissionState>("UNKNOWN");
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const [lastErrorCode, setLastErrorCode] =
    useState<StudioDeviceErrorCode | null>(null);

  useEffect(() => {
    recordingActiveRef.current = recordingActive;
  }, [recordingActive]);

  useEffect(() => {
    selectedRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const applySelection = useCallback(
    (
      preferred: string | null,
      nextInputs: StudioAudioInputOption[],
      persist: boolean,
    ) => {
      const resolved = resolveSelectedInputDeviceId({
        preferredId: preferred,
        inputs: nextInputs,
      });
      setSelectedDeviceIdState(resolved.selectedId);
      selectedRef.current = resolved.selectedId;
      if (resolved.fellBackFromStale) {
        setSoftNotice(studioDeviceErrorMessagePl("DEVICE_NOT_FOUND"));
        setLastErrorCode("DEVICE_NOT_FOUND");
        writeStoredAudioInputDeviceId(
          browserLocalStorage(),
          resolved.selectedId,
        );
      } else if (persist && resolved.selectedId) {
        writeStoredAudioInputDeviceId(
          browserLocalStorage(),
          resolved.selectedId,
        );
      }
      if (nextInputs.length === 0) {
        setLastErrorCode("NO_INPUT_DEVICE");
      }
      return resolved;
    },
    [],
  );

  const refreshInputs = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      setInputs([]);
      setPermission((p) => (p === "GRANTED" ? p : "UNAVAILABLE"));
      setLastErrorCode("NO_INPUT_DEVICE");
      return [] as StudioAudioInputOption[];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mapped = mapMediaDevicesToAudioInputs(devices);
      setInputs(mapped);
      applySelection(selectedRef.current, mapped, false);
      if (mapped.length === 0) {
        setLastErrorCode("NO_INPUT_DEVICE");
      }
      return mapped;
    } catch {
      setInputs([]);
      setPermission((p) => (p === "GRANTED" ? p : "UNAVAILABLE"));
      setLastErrorCode("NO_INPUT_DEVICE");
      return [] as StudioAudioInputOption[];
    }
  }, [applySelection]);

  const setSelectedDeviceId = useCallback((deviceId: string) => {
    setSoftNotice(null);
    setLastErrorCode(null);
    setSelectedDeviceIdState(deviceId);
    selectedRef.current = deviceId;
    writeStoredAudioInputDeviceId(browserLocalStorage(), deviceId);
  }, []);

  const clearSoftNotice = useCallback(() => {
    setSoftNotice(null);
  }, []);

  /** Probe mic (stops tracks). Updates permission + labels. */
  const probeMicrophone = useCallback(async (): Promise<
    | { ok: true; fellBack: boolean }
    | { ok: false; code: StudioDeviceErrorCode; message: string }
  > => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPermission("UNAVAILABLE");
      setLastErrorCode("NO_INPUT_DEVICE");
      return {
        ok: false,
        code: "NO_INPUT_DEVICE",
        message: studioDeviceErrorMessagePl("NO_INPUT_DEVICE"),
      };
    }

    setPermission("REQUESTING");
    setLastErrorCode(null);

    const result = await acquireMicStream({
      getUserMedia: navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      ),
      preferredDeviceId: selectedRef.current,
    });

    if (!result.ok) {
      setPermission(result.permission);
      setLastErrorCode(result.code);
      return {
        ok: false,
        code: result.code,
        message: studioDeviceErrorMessagePl(result.code),
      };
    }

    stopMediaStreamTracks(result.stream);
    setPermission("GRANTED");

    const mapped = await refreshInputs();
    const preferredAfter = result.usedDeviceId ?? selectedRef.current;
    const resolved = applySelection(preferredAfter, mapped, true);
    if (result.fellBack || resolved.fellBackFromStale) {
      setSoftNotice(studioDeviceErrorMessagePl("DEVICE_NOT_FOUND"));
      setLastErrorCode("DEVICE_NOT_FOUND");
    }

    return {
      ok: true,
      fellBack: result.fellBack || resolved.fellBackFromStale,
    };
  }, [applySelection, refreshInputs]);

  // Initial enumerate after mount (labels may be empty pre-permission).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mapped = await refreshInputs();
      if (cancelled) return;
      applySelection(selectedRef.current, mapped, false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  // devicechange — never abort capture from list refresh alone.
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md?.addEventListener) return;

    const onChange = () => {
      void refreshInputs().then((mapped) => {
        if (recordingActiveRef.current) {
          const stillThere =
            selectedRef.current != null &&
            mapped.some((d) => d.deviceId === selectedRef.current);
          if (!stillThere && mapped.length > 0) {
            setSoftNotice(studioDeviceErrorMessagePl("DEVICE_NOT_FOUND"));
          }
          return;
        }
        applySelection(selectedRef.current, mapped, true);
      });
    };

    md.addEventListener("devicechange", onChange);
    return () => {
      md.removeEventListener("devicechange", onChange);
    };
  }, [applySelection, refreshInputs]);

  return {
    inputs,
    selectedDeviceId,
    setSelectedDeviceId,
    permission,
    softNotice,
    lastErrorCode,
    clearSoftNotice,
    refreshInputs,
    probeMicrophone,
    /** For TakeMediaRecorder.start — empty string → omit (system default). */
    audioDeviceIdForRecorder: selectedDeviceId ?? "",
  };
}

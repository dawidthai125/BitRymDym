"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  mapMediaDevicesToAudioOutputs,
  readStoredAudioOutputDeviceId,
  resolveSelectedOutputDeviceId,
  shouldShowStudioOutputPicker,
  supportsAudioContextSetSinkId,
  writeStoredAudioOutputDeviceId,
  type StudioAudioOutputOption,
} from "@/lib/studio/studio-output-devices";
import { studioDeviceIdsHidden } from "@/lib/studio/studio-input-devices";

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const subscribeNever = () => () => undefined;

function readPickerEnabled(): boolean {
  return shouldShowStudioOutputPicker({
    supportsSetSinkId: supportsAudioContextSetSinkId(),
    isMobileLike: window.matchMedia("(max-width: 768px), (pointer: coarse)")
      .matches,
  });
}

/**
 * AUD-01 — desktop output picker only when AudioContext.setSinkId is present.
 * Mobile / unsupported → Automatic only (no fake list).
 */
export function useStudioOutputDevices(options?: {
  onSinkIdChange?: (sinkId: string | null) => void | Promise<void>;
}) {
  const onSinkIdChange = options?.onSinkIdChange;
  const selectedRef = useRef<string | null>(null);

  // false on the server and in the first client render (hydration), then the real answer.
  const pickerEnabled = useSyncExternalStore(
    subscribeNever,
    readPickerEnabled,
    () => false,
  );
  const [outputs, setOutputs] = useState<StudioAudioOutputOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [softNotice, setSoftNotice] = useState<string | null>(null);
  const appliedInitialSinkRef = useRef(false);

  useEffect(() => {
    selectedRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const refreshOutputs = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      setOutputs([]);
      return [] as StudioAudioOutputOption[];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mapped = mapMediaDevicesToAudioOutputs(devices);
      setOutputs(mapped);
      // No permission yet: the browser hides every id, so nothing can be judged as missing.
      if (studioDeviceIdsHidden(mapped)) return mapped;
      const resolved = resolveSelectedOutputDeviceId({
        preferredId: selectedRef.current,
        outputs: mapped,
      });
      if (resolved.fellBackFromStale) {
        setSelectedDeviceIdState(null);
        selectedRef.current = null;
        writeStoredAudioOutputDeviceId(browserLocalStorage(), null);
        setSoftNotice("Wybrane urządzenie odsłuchu jest niedostępne. Użyto automatycznego.");
      }
      return mapped;
    } catch {
      setOutputs([]);
      return [] as StudioAudioOutputOption[];
    }
  }, []);

  useEffect(() => {
    if (!pickerEnabled) return;
    let cancelled = false;
    selectedRef.current = readStoredAudioOutputDeviceId(browserLocalStorage());
    void (async () => {
      if (selectedRef.current) setSelectedDeviceIdState(selectedRef.current);
      await refreshOutputs();
      if (cancelled || appliedInitialSinkRef.current) return;
      appliedInitialSinkRef.current = true;
      await onSinkIdChange?.(selectedRef.current);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount when picker enabled
  }, [pickerEnabled, refreshOutputs]);

  useEffect(() => {
    if (!pickerEnabled) return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md?.addEventListener) return;
    const onChange = () => {
      void refreshOutputs();
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [pickerEnabled, refreshOutputs]);

  const setSelectedDeviceId = useCallback(
    (deviceId: string | null) => {
      const next =
        deviceId && deviceId.trim() !== "" ? deviceId.trim() : null;
      setSoftNotice(null);
      setSelectedDeviceIdState(next);
      selectedRef.current = next;
      writeStoredAudioOutputDeviceId(browserLocalStorage(), next);
      void onSinkIdChange?.(next);
    },
    [onSinkIdChange],
  );

  return {
    pickerEnabled,
    outputs,
    selectedDeviceId,
    setSelectedDeviceId,
    softNotice,
    refreshOutputs,
  };
}

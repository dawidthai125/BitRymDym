"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  mapMediaDevicesToAudioOutputs,
  readStoredAudioOutputDeviceId,
  resolveSelectedOutputDeviceId,
  shouldShowStudioOutputPicker,
  supportsAudioContextSetSinkId,
  writeStoredAudioOutputDeviceId,
  type StudioAudioOutputOption,
} from "@/lib/studio/studio-output-devices";

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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

  const [pickerEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const supports = supportsAudioContextSetSinkId();
    const mobile = window.matchMedia(
      "(max-width: 768px), (pointer: coarse)",
    ).matches;
    return shouldShowStudioOutputPicker({
      supportsSetSinkId: supports,
      isMobileLike: mobile,
    });
  });
  const [outputs, setOutputs] = useState<StudioAudioOutputOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
    () => readStoredAudioOutputDeviceId(browserLocalStorage()),
  );
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
    void (async () => {
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

"use client";

import { useTranslations } from "next-intl";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePlayerOptional } from "@/components/player/player-provider";
import { isAudioSessionDedupEnabled } from "@/config/audio-session-dedup";
import { loadSessionAudioFromUrl } from "@/lib/audio/session-audio-bytes";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";
import {
  StudioAudioEngine,
  type StudioMeterSnapshot,
} from "@/lib/studio/studio-audio-engine";
import {
  STUDIO_TAKE_PLAYBACK_ERROR_PL,
  userFacingPlaybackError,
  type StudioAudioErrorCode,
} from "@/lib/studio/studio-audio-errors";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
  type StudioResolvedSource,
} from "@/lib/studio/studio-audio-source-adapter";
import { resolveStudioBeatSessionSource } from "@/lib/studio/studio-beat-session-source";
import {
  STUDIO_METER_NEUTRAL,
  type StudioTrackLevelSnapshot,
} from "@/lib/studio/studio-meter";
import {
  beatDurationMs,
  fireStudioClick,
  loopRegionOrNull,
  wrapLoopPlayhead,
} from "@/lib/studio/studio-daw-clock";
import type { StudioTransportPhase } from "@/lib/studio/studio-transport";
import { STUDIO_TAKE_SOURCE_CHANGED_EVENT } from "@/lib/studio/cleanup/cleanup-events";
import { clampPlayheadMs, formatStudioTimeMs } from "@/lib/studio/studio-time";

export type StudioAudioLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error"
  | "no_beat";

/** Low-frequency transport controls — does not tick with playhead/meters. */
export type StudioTransportControlsApi = {
  phase: StudioTransportPhase;
  timelineLengthMs: number;
  audioState: StudioAudioLoadState;
  error: string | null;
  hasBeat: boolean;
  takePreviewActive: boolean;
  /** Imperative read of latest playhead without playhead-context subscription. */
  getPlayheadMs: () => number;
  setTrackMeterTarget: (trackId: string | null) => void;
  /** Stage 0 — per-track meters; returns release (ref-counted, off at 0). */
  retainTrackLevels: () => () => void;
  /** Stage 0 — subscribe outside React state so only meter leaves re-render. */
  subscribeTrackLevels: (
    listener: (levels: ReadonlyMap<string, StudioTrackLevelSnapshot>) => void,
  ) => () => void;
  setOutputSinkId: (
    sinkId: string | null,
  ) => Promise<{ applied: boolean; reason?: string }>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (playheadMs: number) => void;
  previewTake: (takeId: string) => Promise<void>;
  stopTakePreview: () => void;
  applyScratchLive: (
    rate: number,
    clipId?: string | null,
    reverse?: boolean,
  ) => void;
  releaseScratchLive: () => void;
  tempoBpm: number;
  timeSignatureNum: number;
  metronomeEnabled: boolean;
  setMetronomeEnabled: (enabled: boolean) => void;
  loopEnabled: boolean;
  loopStartMs: number;
  loopEndMs: number;
  setLoop: (next: {
    enabled: boolean;
    startMs?: number;
    endMs?: number;
  }) => void;
  getContextForAux: () => ReturnType<StudioAudioEngine["getContextForAux"]>;
  resolveClipSourceUrl: (clip: {
    sourceKind: string;
    sourceTakeId: string | null;
    sourceBeatId: string | null;
    sourceArtifactId: string | null;
  }) => Promise<string | null>;
};

export type StudioTransportPlayheadApi = {
  playheadMs: number;
  timeLabel: string;
};

export type StudioTransportMetersApi = {
  meter: StudioMeterSnapshot;
  trackMeter: StudioMeterSnapshot;
};

/** Combined API for leaves that intentionally subscribe to all bands. */
export type StudioTransportApi = StudioTransportControlsApi &
  StudioTransportPlayheadApi &
  StudioTransportMetersApi & {
    state: {
      phase: StudioTransportPhase;
      playheadMs: number;
      timelineLengthMs: number;
    };
  };

const StudioTransportControlsContext =
  createContext<StudioTransportControlsApi | null>(null);
const StudioTransportPlayheadContext =
  createContext<StudioTransportPlayheadApi | null>(null);
const StudioTransportMetersContext =
  createContext<StudioTransportMetersApi | null>(null);

export type BeatClipTiming = {
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
};

export type TakeClipTiming = {
  takeId: string;
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
  gainDb?: number;
  muted?: boolean;
};

const URL_REFRESH_MS = 15_000;

/** Gaps P1 #5 — signed URL of a take's applied vocal cleanup, or null (play the original). */
async function resolveCleanedTakeSource(id: string): Promise<StudioResolvedSource | null> {
  try {
    const res = await fetch(`/api/studio/cleanup/source?takeId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = (await res.json()) as { url?: string | null; jobId?: string | null };
    if (!res.ok || !json.url || !json.jobId) return null;
    if (!isAudioSessionDedupEnabled()) return { url: json.url, expiresAt: Date.now() + 9 * 60_000 };
    const { objectUrl } = await loadSessionAudioFromUrl(`take:${id}:clean:${json.jobId}`, json.url, { enabled: true });
    return objectUrl
      ? { url: objectUrl, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }
      : { url: json.url, expiresAt: Date.now() + 9 * 60_000 };
  } catch {
    return null;
  }
}

/**
 * Project timeline transport. Distinct from PlayerProvider.
 * Audible realization is StudioAudioEngine (Web Audio graph), not HTMLAudio mix SSOT.
 *
 * Phase 7.1.5 — split React contexts:
 * - controls (low frequency)
 * - playhead (high frequency)
 * - meters (high frequency)
 * One StudioAudioEngine / one AudioContext remains.
 */
export function StudioTransportProvider({
  timelineLengthMs,
  beatId,
  engineDocument,
  tempoBpm = 120,
  timeSignatureNum = 4,
  children,
}: {
  timelineLengthMs: number;
  beatId: string | null;
  engineDocument: StudioEngineDocument;
  tempoBpm?: number;
  timeSignatureNum?: number;
  children: ReactNode;
}) {
  const t = useTranslations("studio.studioTransportProvider");
  const catalogPlayer = usePlayerOptional();
  const engineRef = useRef<StudioAudioEngine | null>(null);
  const engineDocumentRef = useRef(engineDocument);
  const phaseRef = useRef<StudioTransportPhase>("stopped");
  const playheadMsRef = useRef(0);
  const beatCacheRef = useRef<Map<string, StudioResolvedSource>>(new Map());
  const takeCacheRef = useRef<Map<string, StudioResolvedSource>>(new Map());

  const [phase, setPhase] = useState<StudioTransportPhase>("stopped");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [audioState, setAudioState] = useState<StudioAudioLoadState>(
    beatId || engineDocument.clips.some((c) => c.sourceKind === "TAKE")
      ? "idle"
      : "no_beat",
  );
  const [error, setError] = useState<string | null>(null);
  const [takePreviewActive, setTakePreviewActive] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStartMs, setLoopStartMs] = useState(0);
  const [loopEndMs, setLoopEndMs] = useState(timelineLengthMs);
  const lastClickBeatRef = useRef(-1);
  const loopRef = useRef({ enabled: false, startMs: 0, endMs: timelineLengthMs });
  const tempoRef = useRef(tempoBpm);
  const timeSigRef = useRef(timeSignatureNum);
  const [meter, setMeter] = useState<StudioMeterSnapshot>(STUDIO_METER_NEUTRAL);
  const [trackMeter, setTrackMeter] =
    useState<StudioMeterSnapshot>(STUDIO_METER_NEUTRAL);
  const trackLevelListenersRef = useRef(
    new Set<(levels: ReadonlyMap<string, StudioTrackLevelSnapshot>) => void>(),
  );
  const trackLevelsRef = useRef<ReadonlyMap<string, StudioTrackLevelSnapshot>>(
    new Map(),
  );
  const trackLevelRetainRef = useRef(0);

  const hasTimelineAudio =
    Boolean(beatId) || engineDocument.clips.some((c) => c.sourceKind === "TAKE");

  async function resolveBeatUrl(id: string): Promise<StudioResolvedSource | null> {
    // WAVE 1.1: always re-resolve access so active assetId is known.
    // URL/blob cache is keyed by beat|assetId — never bare beatId.
    const result = await requestBeatAudioAccessAction({
      beatId: id,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
    });
    return resolveStudioBeatSessionSource({
      beatId: id,
      access: result,
      urlCache: beatCacheRef.current,
      dedupEnabled: isAudioSessionDedupEnabled(),
      urlRefreshMs: URL_REFRESH_MS,
    });
  }

  async function resolveTakeUrl(id: string): Promise<StudioResolvedSource | null> {
    const cached = takeCacheRef.current.get(id);
    if (cached && cached.expiresAt - Date.now() > URL_REFRESH_MS) {
      return cached;
    }
    // Gaps P1 #5: an applied vocal cleanup replaces the take's source (same length).
    const cleaned = await resolveCleanedTakeSource(id);
    if (cleaned) {
      takeCacheRef.current.set(id, cleaned);
      return cleaned;
    }
    const res = await fetch("/api/takes/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId: id }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      url?: string;
      expiresAt?: string;
    };
    if (!res.ok || !json.success || !json.url) return null;

    let playableUrl = json.url;
    let expiresAt = json.expiresAt
      ? Date.parse(json.expiresAt)
      : Date.now() + 60_000;

    if (isAudioSessionDedupEnabled()) {
      const sessionKey = `take:${id}`;
      const { objectUrl } = await loadSessionAudioFromUrl(
        sessionKey,
        json.url,
        { enabled: true },
      );
      if (objectUrl) {
        playableUrl = objectUrl;
        expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      }
    }

    const source: StudioResolvedSource = {
      url: playableUrl,
      expiresAt,
    };
    takeCacheRef.current.set(id, source);
    return source;
  }

  // Gaps P1 #5: cleaned ↔ original switched for a take → forget its URL + voices.
  useEffect(() => {
    const onChange = (e: Event) => {
      const takeId = (e as CustomEvent<{ takeId?: string }>).detail?.takeId;
      if (!takeId) return;
      takeCacheRef.current.delete(takeId);
      engineRef.current?.invalidateTakeSource(takeId);
    };
    window.addEventListener(STUDIO_TAKE_SOURCE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(STUDIO_TAKE_SOURCE_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    catalogPlayer?.setSuppressed(true);
    const engine = new StudioAudioEngine({
      registry: createStudioSourceAdapterRegistry(
        createDefaultStudioSourceAdapters({
          resolveBeatUrl,
          resolveTakeUrl,
        }),
      ),
      listener: {
        onPlayhead(next) {
          const length = engineDocumentRef.current.timelineLengthMs;
          let clamped = clampPlayheadMs(next, length);
          const loop = loopRef.current;
          const region = loopRegionOrNull({
            enabled: loop.enabled,
            startMs: loop.startMs,
            endMs: loop.endMs,
            timelineLengthMs: length,
          });
          if (region && clamped >= region.endMs) {
            clamped = wrapLoopPlayhead(clamped, region.startMs, region.endMs);
            playheadMsRef.current = clamped;
            setPlayheadMs(clamped);
            void engineRef.current?.seek(clamped, true);
            return;
          }
          playheadMsRef.current = clamped;
          setPlayheadMs(clamped);
        },
        onLifecycle(lifecycle) {
          if (lifecycle === "playing") {
            phaseRef.current = "playing";
            setPhase("playing");
            setAudioState("playing");
            return;
          }
          if (lifecycle === "paused") {
            if (phaseRef.current !== "stopped") {
              phaseRef.current = "paused";
            }
            setPhase((p) => (p === "stopped" ? p : "paused"));
            setAudioState((s) =>
              s === "error" || s === "no_beat" ? s : "paused",
            );
            return;
          }
          if (lifecycle === "stopped") {
            phaseRef.current = "stopped";
            setPhase("stopped");
            setAudioState((s) =>
              s === "error" || s === "no_beat" || s === "idle" ? s : "ready",
            );
            return;
          }
          if (lifecycle === "ready" || lifecycle === "initialized") {
            setAudioState((s) =>
              s === "error" || s === "playing" || s === "no_beat" ? s : "ready",
            );
          }
        },
        onError(params: {
          code: StudioAudioErrorCode;
          sourceKind?: string;
          clipId?: string;
        }) {
          if (params.code === "AUDIO_SYNC_FAILED") return;
          if (params.code.startsWith("AUDIO_FX_")) return;
          if (params.sourceKind === "ARTIFACT") return;
          setError(
            userFacingPlaybackError({
              code: params.code,
              sourceKind: params.sourceKind,
            }),
          );
          if (phaseRef.current !== "playing") {
            setAudioState("error");
          }
        },
        onTimelineEnded() {
          const length = engineDocumentRef.current.timelineLengthMs;
          const loop = loopRef.current;
          const region = loopRegionOrNull({
            enabled: loop.enabled,
            startMs: loop.startMs,
            endMs: loop.endMs,
            timelineLengthMs: length,
          });
          if (region) {
            playheadMsRef.current = region.startMs;
            setPlayheadMs(region.startMs);
            void engine.seek(region.startMs, true);
            return;
          }
          setPhase("stopped");
          playheadMsRef.current = length;
          setPlayheadMs(length);
          setAudioState((s) => (s === "error" || s === "no_beat" ? s : "ready"));
        },
      },
    });
    engineRef.current = engine;
    engine.setDocument(engineDocument);
    const unsubMeter = engine.subscribeMeter(setMeter);
    const unsubTrackMeter = engine.subscribeTrackMeter(setTrackMeter);
    const unsubTrackLevels = engine.subscribeTrackLevels((levels) => {
      trackLevelsRef.current = levels;
      for (const listener of trackLevelListenersRef.current) listener(levels);
    });
    engine.setTrackLevelsEnabled(trackLevelRetainRef.current > 0);

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      engine.setMeterDocumentHidden(document.visibilityState === "hidden");
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
      onVisibility();
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      unsubMeter();
      unsubTrackMeter();
      unsubTrackLevels();
      engine.setTrackMeterTarget(null);
      engine.dispose();
      engineRef.current = null;
      setMeter(STUDIO_METER_NEUTRAL);
      setTrackMeter(STUDIO_METER_NEUTRAL);
      catalogPlayer?.setSuppressed(false);
    };
    // One engine per editor mount. Document updates go through setDocument.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/dispose only
  }, [catalogPlayer]);

  tempoRef.current = tempoBpm;
  timeSigRef.current = timeSignatureNum;
  loopRef.current = {
    enabled: loopEnabled,
    startMs: loopStartMs,
    endMs: loopEndMs,
  };

  useEffect(() => {
    if (!metronomeEnabled) {
      lastClickBeatRef.current = -1;
      return;
    }
    const id = window.setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const ctx = engineRef.current?.getContextForAux();
      if (!ctx) return;
      const beatMs = beatDurationMs(tempoRef.current);
      if (beatMs < 1) return;
      const beatIndex = Math.floor(playheadMsRef.current / beatMs);
      if (beatIndex === lastClickBeatRef.current) return;
      lastClickBeatRef.current = beatIndex;
      const beatsPerBar = timeSigRef.current > 0 ? timeSigRef.current : 4;
      fireStudioClick(ctx, beatIndex % beatsPerBar === 0);
    }, 30);
    return () => window.clearInterval(id);
  }, [metronomeEnabled]);

  useEffect(() => {
    engineDocumentRef.current = engineDocument;
    engineRef.current?.setDocument(engineDocument);
  }, [engineDocument]);

  const getPlayheadMs = useCallback(
    () => clampPlayheadMs(playheadMsRef.current, timelineLengthMs),
    [timelineLengthMs],
  );

  const play = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!hasTimelineAudio) {
      setAudioState("no_beat");
      setError(t("brakBituWProjekcie"));
      return;
    }
    setTakePreviewActive(false);
    setError(null);
    setAudioState("loading");
    void engine.play(playheadMsRef.current);
  }, [hasTimelineAudio]);

  const pause = useCallback(() => {
    if (takePreviewActive) {
      engineRef.current?.stopPreview();
      setTakePreviewActive(false);
    }
    engineRef.current?.pause();
  }, [takePreviewActive]);

  const stop = useCallback(() => {
    engineRef.current?.stopPreview();
    setTakePreviewActive(false);
    engineRef.current?.stop();
    phaseRef.current = "stopped";
    setPhase("stopped");
    playheadMsRef.current = 0;
    setPlayheadMs(0);
    setAudioState((s) =>
      s === "error" || s === "no_beat" || s === "idle" ? s : "ready",
    );
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const clamped = clampPlayheadMs(ms, timelineLengthMs);
      playheadMsRef.current = clamped;
      setPlayheadMs(clamped);
      const playing = phaseRef.current === "playing";
      void engineRef.current?.seek(clamped, playing);
    },
    [timelineLengthMs],
  );

  const stopTakePreview = useCallback(() => {
    engineRef.current?.stopPreview();
    setTakePreviewActive(false);
  }, []);

  const setTrackMeterTarget = useCallback((trackId: string | null) => {
    engineRef.current?.setTrackMeterTarget(trackId);
  }, []);

  const retainTrackLevels = useCallback(() => {
    trackLevelRetainRef.current += 1;
    engineRef.current?.setTrackLevelsEnabled(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      trackLevelRetainRef.current = Math.max(0, trackLevelRetainRef.current - 1);
      if (trackLevelRetainRef.current === 0) {
        engineRef.current?.setTrackLevelsEnabled(false);
      }
    };
  }, []);

  const subscribeTrackLevels = useCallback(
    (listener: (levels: ReadonlyMap<string, StudioTrackLevelSnapshot>) => void) => {
      trackLevelListenersRef.current.add(listener);
      listener(trackLevelsRef.current);
      return () => {
        trackLevelListenersRef.current.delete(listener);
      };
    },
    [],
  );

  const setOutputSinkId = useCallback(
    async (
      sinkId: string | null,
    ): Promise<{ applied: boolean; reason?: string }> => {
      const engine = engineRef.current;
      if (!engine) return { applied: false, reason: "no_context" };
      return engine.setOutputSinkId(sinkId);
    },
    [],
  );

  const resolveClipSourceUrl = useCallback(
    async (clip: {
      sourceKind: string;
      sourceTakeId: string | null;
      sourceBeatId: string | null;
      sourceArtifactId: string | null;
    }): Promise<string | null> => {
      if (clip.sourceKind === "TAKE" && clip.sourceTakeId) {
        const source = await resolveTakeUrl(clip.sourceTakeId);
        return source?.url ?? null;
      }
      if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) {
        const source = await resolveBeatUrl(clip.sourceBeatId);
        return source?.url ?? null;
      }
      // ARTIFACT playback / peaks not shipped for Studio waveform v1.
      return null;
    },
    [],
  );

  const applyScratchLive = useCallback(
    (rate: number, clipId?: string | null, reverse?: boolean) => {
      engineRef.current?.applyScratchLive({ clipId, rate, reverse });
    },
    [],
  );

  const releaseScratchLive = useCallback(() => {
    engineRef.current?.releaseScratchLive();
  }, []);

  const setLoop = useCallback(
    (next: { enabled: boolean; startMs?: number; endMs?: number }) => {
      setLoopEnabled(next.enabled);
      if (typeof next.startMs === "number") {
        setLoopStartMs(Math.max(0, Math.round(next.startMs)));
      }
      if (typeof next.endMs === "number") {
        setLoopEndMs(Math.round(next.endMs));
      }
    },
    [],
  );

  const getContextForAux = useCallback(
    () => engineRef.current?.getContextForAux() ?? null,
    [],
  );

  const previewTake = useCallback(async (takeId: string): Promise<void> => {
    if (!takeId) {
      setError(STUDIO_TAKE_PLAYBACK_ERROR_PL);
      throw new Error(STUDIO_TAKE_PLAYBACK_ERROR_PL);
    }
    const engine = engineRef.current;
    if (!engine) {
      setError(STUDIO_TAKE_PLAYBACK_ERROR_PL);
      throw new Error(STUDIO_TAKE_PLAYBACK_ERROR_PL);
    }
    engine.pause();
    phaseRef.current = "paused";
    setPhase("paused");
    const source = await resolveTakeUrl(takeId);
    if (!source) {
      setError(STUDIO_TAKE_PLAYBACK_ERROR_PL);
      throw new Error(STUDIO_TAKE_PLAYBACK_ERROR_PL);
    }
    setError(null);
    setTakePreviewActive(true);
    try {
      await engine.previewTake(takeId, source.url);
    } catch {
      setTakePreviewActive(false);
      setError(STUDIO_TAKE_PLAYBACK_ERROR_PL);
      throw new Error(STUDIO_TAKE_PLAYBACK_ERROR_PL);
    }
  }, []);

  const controlsApi = useMemo<StudioTransportControlsApi>(
    () => ({
      phase,
      timelineLengthMs,
      audioState,
      error,
      hasBeat: Boolean(beatId),
      takePreviewActive,
      getPlayheadMs,
      setTrackMeterTarget,
      retainTrackLevels,
      subscribeTrackLevels,
      setOutputSinkId,
      play,
      pause,
      stop,
      seek,
      previewTake,
      stopTakePreview,
      applyScratchLive,
      releaseScratchLive,
      tempoBpm,
      timeSignatureNum,
      metronomeEnabled,
      setMetronomeEnabled,
      loopEnabled,
      loopStartMs,
      loopEndMs,
      setLoop,
      getContextForAux,
      resolveClipSourceUrl,
    }),
    [
      phase,
      timelineLengthMs,
      audioState,
      error,
      beatId,
      takePreviewActive,
      getPlayheadMs,
      setTrackMeterTarget,
      retainTrackLevels,
      subscribeTrackLevels,
      setOutputSinkId,
      play,
      pause,
      stop,
      seek,
      previewTake,
      stopTakePreview,
      applyScratchLive,
      releaseScratchLive,
      tempoBpm,
      timeSignatureNum,
      metronomeEnabled,
      loopEnabled,
      loopStartMs,
      loopEndMs,
      setLoop,
      getContextForAux,
      resolveClipSourceUrl,
    ],
  );

  const clampedPlayhead = clampPlayheadMs(playheadMs, timelineLengthMs);
  const playheadApi = useMemo<StudioTransportPlayheadApi>(
    () => ({
      playheadMs: clampedPlayhead,
      timeLabel: formatStudioTimeMs(clampedPlayhead),
    }),
    [clampedPlayhead],
  );

  const metersApi = useMemo<StudioTransportMetersApi>(
    () => ({
      meter,
      trackMeter,
    }),
    [meter, trackMeter],
  );

  return (
    <StudioTransportControlsContext.Provider value={controlsApi}>
      <StudioTransportPlayheadContext.Provider value={playheadApi}>
        <StudioTransportMetersContext.Provider value={metersApi}>
          {children}
        </StudioTransportMetersContext.Provider>
      </StudioTransportPlayheadContext.Provider>
    </StudioTransportControlsContext.Provider>
  );
}

/** Same as useStudioTransportControls, but null outside the provider (panels, tests). */
export function useOptionalStudioTransportControls(): StudioTransportControlsApi | null {
  return useContext(StudioTransportControlsContext);
}

export function useStudioTransportControls(): StudioTransportControlsApi {
  const ctx = useContext(StudioTransportControlsContext);
  if (!ctx) {
    throw new Error(
      "useStudioTransportControls must be used within StudioTransportProvider",
    );
  }
  return ctx;
}

export function useStudioTransportPlayhead(): StudioTransportPlayheadApi {
  const ctx = useContext(StudioTransportPlayheadContext);
  if (!ctx) {
    throw new Error(
      "useStudioTransportPlayhead must be used within StudioTransportProvider",
    );
  }
  return ctx;
}

export function useStudioTransportMeters(): StudioTransportMetersApi {
  const ctx = useContext(StudioTransportMetersContext);
  if (!ctx) {
    throw new Error(
      "useStudioTransportMeters must be used within StudioTransportProvider",
    );
  }
  return ctx;
}

/**
 * Wide subscription — prefer split hooks in large shells.
 * Leaves that need playhead + meters + controls may use this intentionally.
 */
export function useStudioTransport(): StudioTransportApi {
  const controls = useStudioTransportControls();
  const playhead = useStudioTransportPlayhead();
  const meters = useStudioTransportMeters();
  return {
    ...controls,
    ...playhead,
    ...meters,
    state: {
      phase: controls.phase,
      playheadMs: playhead.playheadMs,
      timelineLengthMs: controls.timelineLengthMs,
    },
  };
}

/**
 * Phase 7.1.5 — pure isolation contract model (test evidence).
 * Mirrors the three-band notify split without React / AudioEngine.
 */
export function createStudioTransportIsolationBus() {
  const renders = { controls: 0, playhead: 0, meters: 0 };
  const listeners = {
    controls: new Set<() => void>(),
    playhead: new Set<() => void>(),
    meters: new Set<() => void>(),
  };
  return {
    subscribe(band: keyof typeof listeners, fn: () => void) {
      listeners[band].add(fn);
      return () => {
        listeners[band].delete(fn);
      };
    },
    notify(band: keyof typeof listeners) {
      for (const fn of listeners[band]) {
        renders[band] += 1;
        fn();
      }
    },
    getRenderCounts() {
      return { ...renders };
    },
  };
}

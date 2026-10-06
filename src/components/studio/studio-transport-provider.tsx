"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePlayerOptional } from "@/components/player/player-provider";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";
import { StudioAudioEngine } from "@/lib/studio/studio-audio-engine";
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
import type { StudioTransportPhase } from "@/lib/studio/studio-transport";
import { clampPlayheadMs, formatStudioTimeMs } from "@/lib/studio/studio-time";

export type StudioAudioLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error"
  | "no_beat";

type StudioTransportApi = {
  state: {
    phase: StudioTransportPhase;
    playheadMs: number;
    timelineLengthMs: number;
  };
  audioState: StudioAudioLoadState;
  timeLabel: string;
  error: string | null;
  hasBeat: boolean;
  /** True while a post-record / library Take is solo-previewed (not timeline layer). */
  takePreviewActive: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (playheadMs: number) => void;
  /**
   * Preview a READY Take via /api/takes/preview on the Studio engine preview voice.
   * Does not use PlayerProvider. Pauses timeline while solo-previewing.
   */
  previewTake: (takeId: string) => Promise<void>;
  stopTakePreview: () => void;
};

const StudioTransportContext = createContext<StudioTransportApi | null>(null);

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

/**
 * Project timeline transport. Distinct from PlayerProvider.
 * Audible realization is StudioAudioEngine (Web Audio graph), not HTMLAudio mix SSOT.
 */
export function StudioTransportProvider({
  timelineLengthMs,
  beatId,
  engineDocument,
  children,
}: {
  timelineLengthMs: number;
  beatId: string | null;
  engineDocument: StudioEngineDocument;
  children: ReactNode;
}) {
  const catalogPlayer = usePlayerOptional();
  const engineRef = useRef<StudioAudioEngine | null>(null);
  const engineDocumentRef = useRef(engineDocument);
  const phaseRef = useRef<StudioTransportPhase>("stopped");
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

  const hasTimelineAudio =
    Boolean(beatId) || engineDocument.clips.some((c) => c.sourceKind === "TAKE");

  async function resolveBeatUrl(id: string): Promise<StudioResolvedSource | null> {
    const cached = beatCacheRef.current.get(id);
    if (cached && cached.expiresAt - Date.now() > URL_REFRESH_MS) {
      return cached;
    }
    const result = await requestBeatAudioAccessAction({
      beatId: id,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
    });
    if (!result.success || !result.url) return null;
    const source: StudioResolvedSource = {
      url: result.url,
      expiresAt: result.expiresAt
        ? Date.parse(result.expiresAt)
        : Date.now() + 60_000,
    };
    beatCacheRef.current.set(id, source);
    return source;
  }

  async function resolveTakeUrl(id: string): Promise<StudioResolvedSource | null> {
    const cached = takeCacheRef.current.get(id);
    if (cached && cached.expiresAt - Date.now() > URL_REFRESH_MS) {
      return cached;
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
    const source: StudioResolvedSource = {
      url: json.url,
      expiresAt: json.expiresAt ? Date.parse(json.expiresAt) : Date.now() + 60_000,
    };
    takeCacheRef.current.set(id, source);
    return source;
  }

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
          const clamped = clampPlayheadMs(
            next,
            engineDocumentRef.current.timelineLengthMs,
          );
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
          setPhase("stopped");
          setPlayheadMs(engineDocumentRef.current.timelineLengthMs);
          setAudioState((s) => (s === "error" || s === "no_beat" ? s : "ready"));
        },
      },
    });
    engineRef.current = engine;
    engine.setDocument(engineDocument);
    return () => {
      engine.dispose();
      engineRef.current = null;
      catalogPlayer?.setSuppressed(false);
    };
    // One engine per editor mount. Document updates go through setDocument.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/dispose only
  }, [catalogPlayer]);

  useEffect(() => {
    engineDocumentRef.current = engineDocument;
    engineRef.current?.setDocument(engineDocument);
  }, [engineDocument]);

  const play = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!hasTimelineAudio) {
      setAudioState("no_beat");
      setError("Brak bitu w projekcie. Dodaj bit, aby odsłuchać.");
      return;
    }
    setTakePreviewActive(false);
    setError(null);
    setAudioState("loading");
    void engine.play(playheadMs);
  };

  const pause = () => {
    if (takePreviewActive) {
      engineRef.current?.stopPreview();
      setTakePreviewActive(false);
    }
    engineRef.current?.pause();
  };

  const stop = () => {
    engineRef.current?.stopPreview();
    setTakePreviewActive(false);
    engineRef.current?.stop();
    phaseRef.current = "stopped";
    setPhase("stopped");
    setPlayheadMs(0);
    setAudioState((s) =>
      s === "error" || s === "no_beat" || s === "idle" ? s : "ready",
    );
  };

  const seek = (ms: number) => {
    const clamped = clampPlayheadMs(ms, timelineLengthMs);
    setPlayheadMs(clamped);
    const playing = phase === "playing";
    void engineRef.current?.seek(clamped, playing);
  };

  const stopTakePreview = () => {
    engineRef.current?.stopPreview();
    setTakePreviewActive(false);
  };

  const previewTake = async (takeId: string): Promise<void> => {
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
  };

  const api: StudioTransportApi = {
    state: {
      phase,
      playheadMs: clampPlayheadMs(playheadMs, timelineLengthMs),
      timelineLengthMs,
    },
    audioState,
    timeLabel: formatStudioTimeMs(clampPlayheadMs(playheadMs, timelineLengthMs)),
    error,
    hasBeat: Boolean(beatId),
    takePreviewActive,
    play,
    pause,
    stop,
    seek,
    previewTake,
    stopTakePreview,
  };

  return (
    <StudioTransportContext.Provider value={api}>
      {children}
    </StudioTransportContext.Provider>
  );
}

export function useStudioTransport(): StudioTransportApi {
  const ctx = useContext(StudioTransportContext);
  if (!ctx) {
    throw new Error("useStudioTransport must be used within StudioTransportProvider");
  }
  return ctx;
}

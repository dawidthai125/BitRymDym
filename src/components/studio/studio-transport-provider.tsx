"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePlayerOptional } from "@/components/player/player-provider";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";
import {
  gainDbToLinearVolume,
  msToSeconds,
  projectPlayheadToSourceSeconds,
  sourceSecondsToProjectPlayheadMs,
} from "@/lib/studio/studio-beat-audio";
import {
  pickTakeClipAtPlayhead,
  type TakeClipTiming,
} from "@/lib/studio/studio-take-audio";
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
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (playheadMs: number) => void;
};

const StudioTransportContext = createContext<StudioTransportApi | null>(null);

export type BeatClipTiming = {
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
};

export type { TakeClipTiming };

const PLAYBACK_ERROR_PL =
  "Nie udało się odtworzyć bitu. Sprawdź połączenie lub spróbuj ponownie.";
const TAKE_PLAYBACK_ERROR_PL =
  "Nie udało się odtworzyć nagrania. Sprawdź połączenie lub spróbuj ponownie.";

function pickBeatClip(
  clips: BeatClipTiming[],
  playheadMs: number,
  timelineLengthMs: number,
): BeatClipTiming {
  const hit = clips.find(
    (c) =>
      playheadMs >= c.timelineStartMs &&
      playheadMs < c.timelineStartMs + c.durationMs,
  );
  if (hit) return hit;
  if (clips[0]) return clips[0];
  return {
    timelineStartMs: 0,
    sourceOffsetMs: 0,
    durationMs: timelineLengthMs,
  };
}

/**
 * Project timeline transport with optional BEAT_REF audio.
 * Distinct from PlayerProvider — uses a local HTMLAudioElement only.
 *
 * Remount when `beatId` changes (parent should set `key={beatId}`) so load
 * state resets without setState-in-effect.
 */
export function StudioTransportProvider({
  timelineLengthMs,
  beatId,
  beatGainDb = 0,
  beatMuted = false,
  beatClips,
  beatClip,
  takeClips = [],
  children,
}: {
  timelineLengthMs: number;
  beatId: string | null;
  beatGainDb?: number;
  beatMuted?: boolean;
  /** All BEAT_REF segments (after split). Preferred over beatClip. */
  beatClips?: BeatClipTiming[];
  /** @deprecated Prefer beatClips — kept for single-clip callers. */
  beatClip?: BeatClipTiming | null;
  /** TAKE clips for layered Studio playback (signed via /api/takes/preview). */
  takeClips?: TakeClipTiming[];
  children: ReactNode;
}) {
  const catalogPlayer = usePlayerOptional();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const expiresAtRef = useRef<string | null>(null);
  const urlReadyRef = useRef(false);
  const activeClipRef = useRef<BeatClipTiming | null>(null);
  const takeUrlCacheRef = useRef<
    Map<string, { url: string; expiresAt: number }>
  >(new Map());
  const activeTakeIdRef = useRef<string | null>(null);
  const takeClipsRef = useRef(takeClips);
  const syncTakeRef = useRef<(headMs: number, shouldPlay: boolean) => void>(
    () => undefined,
  );

  useEffect(() => {
    takeClipsRef.current = takeClips;
  }, [takeClips]);

  const [phase, setPhase] = useState<StudioTransportPhase>("stopped");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [audioState, setAudioState] = useState<StudioAudioLoadState>(
    beatId ? "idle" : "no_beat",
  );
  const [error, setError] = useState<string | null>(null);

  const clips: BeatClipTiming[] =
    beatClips && beatClips.length > 0
      ? beatClips
      : beatClip
        ? [beatClip]
        : [];

  const earliestStart =
    clips.length > 0
      ? Math.min(...clips.map((c) => c.timelineStartMs))
      : 0;

  useEffect(() => {
    catalogPlayer?.setSuppressed(true);
    return () => {
      catalogPlayer?.setSuppressed(false);
    };
  }, [catalogPlayer]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = beatMuted;
    audio.volume = beatMuted ? 0 : gainDbToLinearVolume(beatGainDb);
  }, [beatGainDb, beatMuted]);

  const syncFromAudio = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const clip =
      activeClipRef.current ??
      pickBeatClip(clips, playheadMs, timelineLengthMs);
    const next = sourceSecondsToProjectPlayheadMs({
      sourceSeconds: audio.currentTime,
      clipTimelineStartMs: clip.timelineStartMs,
      clipSourceOffsetMs: clip.sourceOffsetMs,
    });
    const end = clip.timelineStartMs + clip.durationMs;
    if (next >= end) {
      audio.pause();
      takeAudioRef.current?.pause();
      setPhase("paused");
      setAudioState("ready");
      setPlayheadMs(clampPlayheadMs(end, timelineLengthMs));
      return;
    }
    const clamped = clampPlayheadMs(next, timelineLengthMs);
    setPlayheadMs(clamped);
    syncTakeRef.current(clamped, !audio.paused);
  });

  const onPlay = useEffectEvent(() => {
    setPhase("playing");
    setAudioState("playing");
  });

  const onPause = useEffectEvent(() => {
    setPhase((p) => (p === "stopped" ? p : "paused"));
    setAudioState((s) => (s === "error" || s === "no_beat" ? s : "paused"));
  });

  const onEnded = useEffectEvent(() => {
    const clip =
      activeClipRef.current ??
      pickBeatClip(clips, playheadMs, timelineLengthMs);
    takeAudioRef.current?.pause();
    activeTakeIdRef.current = null;
    setPhase("stopped");
    setAudioState("ready");
    setPlayheadMs(
      clampPlayheadMs(
        clip.timelineStartMs + clip.durationMs,
        timelineLengthMs,
      ),
    );
  });

  const onErr = useEffectEvent(() => {
    takeAudioRef.current?.pause();
    setPhase("paused");
    setAudioState("error");
    setError(PLAYBACK_ERROR_PL);
  });

  const onPauseWithTake = useEffectEvent(() => {
    takeAudioRef.current?.pause();
    onPause();
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => syncFromAudio();
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPauseWithTake);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPauseWithTake);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
    };
  }, []);

  async function ensureSource(): Promise<boolean> {
    if (!beatId) {
      setAudioState("no_beat");
      setError("Brak bitu w projekcie. Dodaj bit, aby odsłuchać.");
      return false;
    }
    const audio = audioRef.current;
    if (!audio) return false;

    const expiresAt = expiresAtRef.current
      ? Date.parse(expiresAtRef.current)
      : 0;
    const stillValid =
      urlReadyRef.current &&
      Number.isFinite(expiresAt) &&
      expiresAt - Date.now() > 15_000;

    if (stillValid && audio.src) {
      setAudioState((s) => (s === "error" ? "ready" : s));
      return true;
    }

    setAudioState("loading");
    setError(null);
    const result = await requestBeatAudioAccessAction({
      beatId,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
    });
    if (!result.success || !result.url) {
      setAudioState("error");
      setError(PLAYBACK_ERROR_PL);
      return false;
    }
    audio.src = result.url;
    expiresAtRef.current = result.expiresAt ?? null;
    urlReadyRef.current = true;
    audio.load();
    setAudioState("ready");
    return true;
  }

  async function ensureTakeUrl(takeId: string): Promise<string | null> {
    const cached = takeUrlCacheRef.current.get(takeId);
    if (cached && cached.expiresAt - Date.now() > 15_000) {
      return cached.url;
    }
    const res = await fetch("/api/takes/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      url?: string;
      expiresAt?: string;
      error?: string;
    };
    if (!res.ok || !json.success || !json.url) {
      return null;
    }
    const expiresAt = json.expiresAt
      ? Date.parse(json.expiresAt)
      : Date.now() + 60_000;
    takeUrlCacheRef.current.set(takeId, { url: json.url, expiresAt });
    return json.url;
  }

  async function syncTakeAtPlayhead(
    headMs: number,
    shouldPlay: boolean,
  ): Promise<void> {
    const takeAudio = takeAudioRef.current;
    if (!takeAudio) return;
    const hit = pickTakeClipAtPlayhead(takeClipsRef.current, headMs);
    if (!hit || hit.muted) {
      takeAudio.pause();
      activeTakeIdRef.current = null;
      return;
    }
    const sourceSec = projectPlayheadToSourceSeconds({
      playheadMs: headMs,
      clipTimelineStartMs: hit.timelineStartMs,
      clipSourceOffsetMs: hit.sourceOffsetMs,
      clipDurationMs: hit.durationMs,
    });
    if (sourceSec == null) {
      takeAudio.pause();
      activeTakeIdRef.current = null;
      return;
    }

    if (activeTakeIdRef.current !== hit.takeId || !takeAudio.src) {
      const url = await ensureTakeUrl(hit.takeId);
      if (!url) {
        takeAudio.pause();
        activeTakeIdRef.current = null;
        setError(TAKE_PLAYBACK_ERROR_PL);
        return;
      }
      takeAudio.src = url;
      activeTakeIdRef.current = hit.takeId;
      takeAudio.load();
    }

    takeAudio.volume = gainDbToLinearVolume(hit.gainDb ?? 0);
    takeAudio.muted = Boolean(hit.muted);
    if (Math.abs(takeAudio.currentTime - sourceSec) > 0.08) {
      takeAudio.currentTime = sourceSec;
    }
    if (shouldPlay) {
      try {
        await takeAudio.play();
      } catch {
        // Beat remains primary clock; take layer is best-effort.
      }
    } else {
      takeAudio.pause();
    }
  }

  useEffect(() => {
    syncTakeRef.current = (headMs, shouldPlay) => {
      void syncTakeAtPlayhead(headMs, shouldPlay);
    };
  });

  const play = () => {
    const headAtClick = playheadMs;
    void (async () => {
      const ok = await ensureSource();
      if (!ok) return;
      const audio = audioRef.current;
      if (!audio) return;
      const clip = pickBeatClip(clips, headAtClick, timelineLengthMs);
      activeClipRef.current = clip;
      const sourceSec = projectPlayheadToSourceSeconds({
        playheadMs: headAtClick,
        clipTimelineStartMs: clip.timelineStartMs,
        clipSourceOffsetMs: clip.sourceOffsetMs,
        clipDurationMs: clip.durationMs || timelineLengthMs,
      });
      const target = sourceSec ?? msToSeconds(clip.sourceOffsetMs);
      if (Math.abs(audio.currentTime - target) > 0.05) {
        audio.currentTime = target;
      }
      try {
        await audio.play();
        await syncTakeAtPlayhead(headAtClick, true);
      } catch {
        setAudioState("error");
        setError(PLAYBACK_ERROR_PL);
      }
    })();
  };

  const pause = () => {
    audioRef.current?.pause();
    takeAudioRef.current?.pause();
  };

  const stop = () => {
    const audio = audioRef.current;
    const takeAudio = takeAudioRef.current;
    const clip = clips[0] ?? {
      timelineStartMs: earliestStart,
      sourceOffsetMs: 0,
      durationMs: timelineLengthMs,
    };
    activeClipRef.current = clip;
    if (audio) {
      audio.pause();
      audio.currentTime = msToSeconds(clip.sourceOffsetMs);
    }
    if (takeAudio) {
      takeAudio.pause();
      activeTakeIdRef.current = null;
    }
    setPhase("stopped");
    setPlayheadMs(clip.timelineStartMs);
    setAudioState((s) =>
      s === "error" || s === "no_beat" || s === "idle" ? s : "ready",
    );
  };

  const seek = (ms: number) => {
    const clamped = clampPlayheadMs(ms, timelineLengthMs);
    setPlayheadMs(clamped);
    const audio = audioRef.current;
    if (!audio || !urlReadyRef.current) {
      void syncTakeAtPlayhead(clamped, false);
      return;
    }
    const clip = pickBeatClip(clips, clamped, timelineLengthMs);
    activeClipRef.current = clip;
    const sourceSec = projectPlayheadToSourceSeconds({
      playheadMs: clamped,
      clipTimelineStartMs: clip.timelineStartMs,
      clipSourceOffsetMs: clip.sourceOffsetMs,
      clipDurationMs: clip.durationMs || timelineLengthMs,
    });
    if (sourceSec == null) {
      audio.pause();
      takeAudioRef.current?.pause();
      setPhase("paused");
      return;
    }
    audio.currentTime = sourceSec;
    void syncTakeAtPlayhead(clamped, !audio.paused);
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
    play,
    pause,
    stop,
    seek,
  };

  return (
    <StudioTransportContext.Provider value={api}>
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <audio ref={takeAudioRef} preload="metadata" className="hidden" />
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

"use client";


import { useTranslations } from "next-intl";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { trackEvent } from "@/lib/analytics/ga";
import { isAudioSessionDedupEnabled } from "@/config/audio-session-dedup";
import {
  buildSessionAudioKey,
  invalidateSessionAudio,
  loadSessionAudioFromUrl,
} from "@/lib/audio/session-audio-bytes";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  PUBLIC_PLAYBACK_PURPOSE,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import { GuestPreviewPrompt } from "@/components/player/guest-preview-prompt";
import { GUEST_POLICY } from "@/config/plan-policy";
import { shouldRestartFromStart } from "@/lib/player/playback-progress";
import { clampPlaybackGain } from "@/lib/player/playback-tools";

export type PlayerTrack = {
  beatId: string;
  title: string;
  producer: string;
  /** Public profile of the author, when it is on. */
  authorHref?: string | null;
  durationSeconds: number;
  artworkVariant: number;
  coverUrl?: string | null;
  /**
   * Admin listen of a draft that has no 20 s preview. Public catalog stays
   * on the short preview. The server still refuses a full file to guests.
   */
  master?: boolean;
};

type PlayerPhase = "idle" | "loading" | "playing" | "paused" | "error";

export type ActivateTrackOptions = {
  /** When false, load source and stay paused (seek-before-play). Default true. */
  autoplay?: boolean;
};

type PlayerContextValue = {
  track: PlayerTrack | null;
  phase: PlayerPhase;
  currentTime: number;
  duration: number;
  error: string | null;
  suppressed: boolean;
  activateTrack: (
    track: PlayerTrack,
    options?: ActivateTrackOptions,
  ) => Promise<void>;
  playTrack: (track: PlayerTrack) => Promise<void>;
  toggle: () => void;
  seek: (time: number) => void;
  close: () => void;
  setSuppressed: (value: boolean) => void;
  volume: number;
  muted: boolean;
  loop: boolean;
  playbackRate: number;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setLoop: (loop: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  /** Guests: server-set preview cap (GUEST_POLICY.previewSeconds); null = full. */
  previewLimitSeconds: number | null;
  /** True after a guest hit the preview cap (sign-in prompt is shown). */
  previewEnded: boolean;
  dismissPreviewPrompt: () => void;
};

/** Guest playback refused: no 20 s preview asset (server never sends the full file). */
class GuestPreviewUnavailableError extends Error {
  constructor() {
    super("guest preview unavailable");
    this.name = "GuestPreviewUnavailableError";
  }
}

/** A newer activation/toggle superseded this load: drop it silently. */
class StalePlaybackRequestError extends Error {
  constructor() {
    super("stale playback request");
    this.name = "StalePlaybackRequestError";
  }
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return ctx;
}

export function usePlayerOptional(): PlayerContextValue | null {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common.playerProvider");
  // Audio callbacks read the latest translator without re-creating the player wiring.
  const tRef = useRef(t);
  useLayoutEffect(() => {
    tRef.current = t;
  }, [t]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const expiresAtRef = useRef<string | null>(null);
  const listenMasterRef = useRef(false);
  /** Session cache key for the current blob:/bytes (WAVE 1-A). */
  const sessionKeyRef = useRef<string | null>(null);
  /** Bumped on every activation / toggle-load; a load whose id is no longer current is stale. */
  const requestIdRef = useRef(0);
  const durationRef = useRef(0);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  /** Guest preview cap from the server; read inside media listeners. */
  const previewLimitRef = useRef<number | null>(null);
  const [previewLimitSeconds, setPreviewLimitSeconds] = useState<number | null>(null);
  const [previewEnded, setPreviewEnded] = useState(false);
  /** Guest asked for a beat that has no server-side 20 s preview yet. */
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoopState] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Keep ended/restart fallback in sync without writing refs during render.
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;

    const onTime = () => {
      const limit = previewLimitRef.current;
      if (limit !== null && audio.currentTime >= limit) {
        // Guest preview cap: stop at the limit and ask to sign in.
        audio.pause();
        if (audio.currentTime > limit) audio.currentTime = limit;
        setCurrentTime(limit);
        setPreviewEnded(true);
        return;
      }
      setCurrentTime(audio.currentTime);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPlay = () => setPhase("playing");
    const onPause = () => {
      if (!audio.ended) setPhase("paused");
    };
    const onEnded = () => {
      setPhase("paused");
      // The guest file itself is only the 20 s preview: its end is the cap.
      if (previewLimitRef.current !== null) setPreviewEnded(true);
      const end =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current;
      setCurrentTime(end > 0 ? end : 0);
    };
    const onErr = () => {
      setPhase("error");
      setError(tRef.current("nieUdaloSieOdtworzyc"));
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onErr);

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onErr);
      audioRef.current = null;
      if (sessionKeyRef.current) {
        invalidateSessionAudio(sessionKeyRef.current);
        sessionKeyRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    audio.loop = loop;
    audio.playbackRate = playbackRate;
  }, [volume, muted, loop, playbackRate]);

  const ensureUrl = useCallback(async (beatId: string, requestId: number): Promise<string> => {
    const isStale = () => requestId !== requestIdRef.current;
    const expired =
      !expiresAtRef.current ||
      new Date(expiresAtRef.current).getTime() <= Date.now() + 5000;
    const audio = audioRef.current;
    if (!audio) throw new Error(tRef.current("playerNiedostepny"));

    const dedup = isAudioSessionDedupEnabled();

    // Same beat + already have a playable src: reuse without network when
    // (a) signed URL still valid, or (b) dedup ON and src is a session blob.
    // A guest at the preview cap re-asks the server (it replays from the top
    // anyway), so signing in lifts the cap on the next play.
    const atPreviewCap =
      previewLimitRef.current !== null &&
      audio.currentTime >= previewLimitRef.current - 0.25;
    const listen = listenMasterRef.current ? "master" : "preview";
    if (
      audio.dataset.beatId === beatId &&
      audio.dataset.listen === listen &&
      audio.src &&
      !atPreviewCap
    ) {
      const usingBlob = audio.src.startsWith("blob:");
      if (!expired || (dedup && usingBlob && sessionKeyRef.current)) {
        return audio.src;
      }
    }

    const result = await requestBeatAudioAccessAction({
      beatId,
      purpose: PUBLIC_PLAYBACK_PURPOSE,
      previewOnly: !listenMasterRef.current,
    });
    // A later click owns the element now: do not touch its src, expiry or preview cap.
    if (isStale()) throw new StalePlaybackRequestError();
    if (!result.success && result.code === "PREVIEW_UNAVAILABLE") {
      throw new GuestPreviewUnavailableError();
    }
    if (!result.success || !result.url) {
      throw new Error(
        toSafePlaybackErrorMessage(result.error || tRef.current("brakDostepuDoOdsluchu")),
      );
    }
    expiresAtRef.current = result.expiresAt ?? null;
    const limit =
      typeof result.previewLimitSeconds === "number" && result.previewLimitSeconds > 0
        ? result.previewLimitSeconds
        : null;
    previewLimitRef.current = limit;
    setPreviewLimitSeconds(limit);

    if (!dedup) {
      if (sessionKeyRef.current) {
        invalidateSessionAudio(sessionKeyRef.current);
        sessionKeyRef.current = null;
      }
      audio.dataset.beatId = beatId;
      audio.dataset.listen = listen;
      audio.src = result.url;
      audio.load();
      return result.url;
    }

    const sessionKey = buildSessionAudioKey({
      kind: "beat",
      id: beatId,
      versionId: result.assetId ?? null,
    });
    if (sessionKeyRef.current && sessionKeyRef.current !== sessionKey) {
      invalidateSessionAudio(sessionKeyRef.current);
    }
    sessionKeyRef.current = sessionKey;

    // The byte copy is only an egress optimisation. If the cross-origin fetch
    // fails (CORS, edge hiccup, network), stream the signed URL directly instead
    // of surfacing "Błąd sieci" for a file the <audio> element can still play.
    let objectUrl: string | null = null;
    try {
      ({ objectUrl } = await loadSessionAudioFromUrl(sessionKey, result.url, {
        enabled: true,
      }));
    } catch {
      if (!isStale()) sessionKeyRef.current = null;
    }
    if (isStale()) {
      // Release the blob this stale load created unless the current request uses the same key.
      if (objectUrl && sessionKeyRef.current !== sessionKey) invalidateSessionAudio(sessionKey);
      throw new StalePlaybackRequestError();
    }
    const playable = objectUrl ?? result.url;
    audio.dataset.beatId = beatId;
    audio.dataset.listen = listen;
    if (audio.src !== playable) {
      audio.src = playable;
      audio.load();
    }
    return playable;
  }, []);

  const restartFromStartIfNeeded = useCallback((audio: HTMLAudioElement) => {
    const limit = previewLimitRef.current;
    if (limit !== null && audio.currentTime >= limit - 0.25) {
      // Guest replays the preview from the top.
      audio.currentTime = 0;
      setCurrentTime(0);
      setPreviewEnded(false);
      return;
    }
    const d =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : durationRef.current;
    if (shouldRestartFromStart(audio.currentTime, d, audio.ended)) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

  /** Statistics (after consent): a beat counts once per page load. */
  const countedPlaysRef = useRef(new Set<string>());
  const countPlay = useCallback((played: PlayerTrack) => {
    if (played.master || countedPlaysRef.current.has(played.beatId)) return;
    countedPlaysRef.current.add(played.beatId);
    trackEvent({ name: "beat_play", params: { beat_id: played.beatId, beat_title: played.title } });
  }, []);

  const activateTrack = useCallback(
    async (next: PlayerTrack, options?: ActivateTrackOptions) => {
      const autoplay = options?.autoplay ?? true;
      const audio = audioRef.current;
      if (!audio) return;
      const requestId = ++requestIdRef.current;

      setError(null);
      setTrack(next);
      setDuration(next.durationSeconds);
      setSuppressed(false);
      setPreviewEnded(false);
      setPreviewUnavailable(false);
      setPhase("loading");
      listenMasterRef.current = next.master === true;

      try {
        if (audio.dataset.beatId !== next.beatId) {
          audio.pause();
          setCurrentTime(0);
        }

        await ensureUrl(next.beatId, requestId);

        if (autoplay) {
          restartFromStartIfNeeded(audio);
          await audio.play();
          if (requestId !== requestIdRef.current) return;
          countPlay(next);
          setPhase("playing");
          return;
        }

        if (!audio.paused) {
          audio.pause();
        }
        setPhase("paused");
        setCurrentTime(audio.currentTime);
      } catch (e) {
        if (e instanceof StalePlaybackRequestError || requestId !== requestIdRef.current) return;
        if (e instanceof GuestPreviewUnavailableError) {
          setPhase("idle");
          setPreviewUnavailable(true);
          return;
        }
        setPhase("error");
        setError(
          toSafePlaybackErrorMessage(
            e instanceof Error ? e.message : tRef.current("nieUdaloSieOdtworzyc2"),
          ),
        );
      }
    },
    [countPlay, ensureUrl, restartFromStartIfNeeded],
  );

  const playTrack = useCallback(
    async (next: PlayerTrack) => {
      await activateTrack(next, { autoplay: true });
    },
    [activateTrack],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      const requestId = ++requestIdRef.current;
      void (async () => {
        try {
          setPhase("loading");
          setPreviewEnded(false);
          await ensureUrl(track.beatId, requestId);
          restartFromStartIfNeeded(audio);
          await audio.play();
          countPlay(track);
        } catch (e) {
          if (e instanceof StalePlaybackRequestError || requestId !== requestIdRef.current) return;
          if (e instanceof GuestPreviewUnavailableError) {
            setPhase("idle");
            setPreviewUnavailable(true);
            return;
          }
          setPhase("error");
          setError(
            toSafePlaybackErrorMessage(
              e instanceof Error ? e.message : tRef.current("nieUdaloSieOdtworzyc2"),
            ),
          );
        }
      })();
    } else {
      audio.pause();
    }
  }, [countPlay, ensureUrl, restartFromStartIfNeeded, track]);

  /** Seek only — never starts playback. */
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    const limit = previewLimitRef.current;
    if (limit !== null && time >= limit) {
      // Seeking past the guest preview: park at the cap and show the prompt.
      audio.pause();
      audio.currentTime = limit;
      setCurrentTime(limit);
      setPreviewEnded(true);
      return;
    }
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
  }, []);

  const close = useCallback(() => {
    // A load still running must not start sound after the player is gone.
    requestIdRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      delete audio.dataset.beatId;
      delete audio.dataset.listen;
    }
    listenMasterRef.current = false;
    if (sessionKeyRef.current) {
      invalidateSessionAudio(sessionKeyRef.current);
      sessionKeyRef.current = null;
    }
    expiresAtRef.current = null;
    previewLimitRef.current = null;
    setPreviewLimitSeconds(null);
    setPreviewEnded(false);
    setTrack(null);
    setPhase("idle");
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  const dismissPreviewPrompt = useCallback(() => {
    setPreviewEnded(false);
    setPreviewUnavailable(false);
  }, []);

  const setVolume = useCallback((next: number) => {
    setVolumeState(clampPlaybackGain(next));
  }, []);
  const setPlaybackRate = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    setPlaybackRateState(Math.min(1.25, Math.max(0.75, next)));
  }, []);

  const value = useMemo(
    () => ({
      track,
      phase,
      currentTime,
      duration,
      error,
      suppressed,
      activateTrack,
      playTrack,
      toggle,
      seek,
      close,
      setSuppressed,
      volume,
      muted,
      loop,
      playbackRate,
      setVolume,
      setMuted,
      setLoop: setLoopState,
      setPlaybackRate,
      previewLimitSeconds,
      previewEnded,
      dismissPreviewPrompt,
    }),
    [
      track,
      phase,
      currentTime,
      duration,
      error,
      suppressed,
      activateTrack,
      playTrack,
      toggle,
      seek,
      close,
      volume,
      muted,
      loop,
      playbackRate,
      setVolume,
      setPlaybackRate,
      previewLimitSeconds,
      previewEnded,
      dismissPreviewPrompt,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {previewUnavailable ? (
        <GuestPreviewPrompt
          variant="unavailable"
          seconds={GUEST_POLICY.previewSeconds}
          beatId={track?.beatId}
          onClose={dismissPreviewPrompt}
        />
      ) : previewEnded && previewLimitSeconds !== null ? (
        <GuestPreviewPrompt
          seconds={previewLimitSeconds}
          beatId={track?.beatId}
          onClose={dismissPreviewPrompt}
        />
      ) : null}
    </PlayerContext.Provider>
  );
}

"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";

import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { BrdAudioTime } from "@/components/brand/brd-audio-meta";
import { Waveform } from "@/components/brand/waveform";
import { createTakePreviewGraph } from "@/lib/audio/take-preview-graph";
import { peaksFromAudioBlob } from "@/lib/audio/peaks-from-buffer";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  formatDurationSeconds,
  PUBLIC_PLAYBACK_PURPOSE,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import { cn } from "@/lib/utils";

type BrdTakePreviewRailProps = {
  beatId: string;
  beatTitle: string;
  takePreviewUrl: string | null;
  /** Local blob for real peaks (preferred over CORS fetch). */
  takeBlob: Blob | null;
  takeDurationSeconds: number | null;
  className?: string;
};

const TAKE_BARS = 64;

/**
 * READY_TAKE dual timeline — BIT + NAGRANIE, BRD Audio Language.
 * Local preview only — not PlayerProvider.
 */
export function BrdTakePreviewRail({
  beatId,
  beatTitle,
  takePreviewUrl,
  takeBlob,
  takeDurationSeconds,
  className,
}: BrdTakePreviewRailProps) {
  const tl = useLibText();
  const tr = useTranslations("common.brdTakePreviewRail");
  const beatRef = useRef<HTMLAudioElement | null>(null);
  const takeRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<ReturnType<typeof createTakePreviewGraph> | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(takeDurationSeconds ?? 0);
  const [takePeaks, setTakePeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!takeBlob) {
      setTakePeaks(null);
      return;
    }
    void peaksFromAudioBlob(takeBlob, TAKE_BARS)
      .then((peaks) => {
        if (!cancelled) setTakePeaks(peaks);
      })
      .catch(() => {
        if (!cancelled) setTakePeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [takeBlob]);

  useEffect(() => {
    let cancelled = false;
    const beatEl = beatRef.current;
    const takeEl = takeRef.current;
    if (!beatEl || !takeEl || !takePreviewUrl) {
      setReady(false);
      return;
    }

    setLoading(true);
    setError(null);
    setPlaying(false);

    void (async () => {
      try {
        const access = await requestBeatAudioAccessAction({
          beatId,
          purpose: PUBLIC_PLAYBACK_PURPOSE,
        });
        if (!access.success || !access.url) {
          throw new Error(access.error || tr("brakDostepuDoBitu"));
        }
        if (cancelled) return;

        graphRef.current?.dispose();
        const graph = createTakePreviewGraph({
          beatEl,
          takeEl,
          beatUrl: access.url,
          takeUrl: takePreviewUrl,
          fallbackDuration: takeDurationSeconds ?? 30,
        });
        graphRef.current = graph;
        setDuration(graph.getDuration());
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(
            toSafePlaybackErrorMessage(
              e instanceof Error
                ? e.message
                : tr("nieUdaloSiePrzygotowac"),
            ),
          );
          setReady(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      graphRef.current?.dispose();
      graphRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [beatId, takePreviewUrl, takeDurationSeconds]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const g = graphRef.current;
      if (!g) return;
      setCurrentTime(g.getCurrentTime());
      setDuration(g.getDuration());
      const beatEl = beatRef.current;
      if (beatEl && beatEl.ended) {
        g.pause();
        setPlaying(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [playing]);

  async function onToggle() {
    const g = graphRef.current;
    if (!g || !ready) return;
    if (playing) {
      g.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      await g.play();
      setPlaying(true);
    } catch {
      setError(tr("nieUdaloSieOdtworzyc"));
    } finally {
      setLoading(false);
    }
  }

  function onSeekRatio(ratio: number) {
    const g = graphRef.current;
    if (!g) return;
    const t = ratio * g.getDuration();
    g.seek(t);
    setCurrentTime(t);
  }

  const progress =
    duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div
      className={cn(
        "space-y-3 border border-[var(--brd-audio-line)] bg-[var(--brd-paper)] p-3 sm:p-4",
        className,
      )}
      aria-label={tr("podgladNagrania")}
    >
      <audio ref={beatRef} preload="none" className="hidden" />
      <audio ref={takeRef} preload="none" className="hidden" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          {tr("podglad")}{" "}{tl(beatTitle)}
        </p>
        <BrdAudioTime
          current={currentTime}
          total={duration || takeDurationSeconds || 0}
          format={formatDurationSeconds}
          className="text-xs"
        />
      </div>

      <div className="space-y-2">
        <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          {tr("bit")}
        </p>
        <Waveform
          seed={beatId}
          progress={progress}
          density="studio"
          showPlayhead={ready}
          interactive={ready}
          onSeekRatio={onSeekRatio}
          aria-label={tr("przebiegBitu")}
        />
      </div>

      <div className="space-y-2">
        <p className="brd-meta text-[9px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
          {tr("nagranie")}
        </p>
        <Waveform
          seed={`${beatId}:take`}
          peaks={takePeaks ?? undefined}
          bars={TAKE_BARS}
          progress={progress}
          density="studio"
          heightClassName="h-9 sm:h-11"
          tone="take"
          showPlayhead={ready}
          interactive={ready}
          onSeekRatio={onSeekRatio}
          aria-label={tr("przebiegNagrania")}
        />
      </div>

      <div className="flex items-center gap-3">
        <BrdAudioPlayButton
          playing={playing}
          loading={loading}
          disabled={!ready && !takePreviewUrl}
          size="md"
          title={tl(beatTitle)}
          onClick={() => void onToggle()}
          aria-label={tl(playing ? tr("pauzaPodgladu") : tr("odtworzPodglad"))}
        />
        <p className="text-sm text-[var(--brd-ink-soft)]">
          {tl(ready
            ? tr("bitNagranie")
            : takePreviewUrl
              ? tr("ladowaniePodgladu")
              : tr("brakUrlPodgladu"))}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-[var(--brd-danger)]" role="alert">
          {tl(error)}
        </p>
      ) : null}
    </div>
  );
}

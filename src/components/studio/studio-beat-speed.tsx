"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { beatSpeedPlayback, isBeatSpeedUp, maxBeatBpm, type BeatSpeedPlayback } from "@/lib/studio/studio-beat-speed";

type BeatClip = { id: string; stretchRatio?: number | null; pitchCents?: number | null };

const round1 = (value: number) => Math.round(value * 10) / 10;

/** "Tempo bitu" in the Bit track menu. The editor saves the clip and keeps the undo. */
export function StudioBeatSpeed({
  baseBpm,
  beatClips,
  hasRecordings,
  disabled,
  onApply,
}: {
  baseBpm: number;
  beatClips: readonly BeatClip[];
  hasRecordings: boolean;
  disabled: boolean;
  onApply: (clipId: string, next: BeatSpeedPlayback) => void;
}) {
  const t = useTranslations("studio.beatSpeed");
  const clip = beatClips.length === 1 ? beatClips[0]! : null;
  const stored = { stretch: clip?.stretchRatio ?? 1, pitchCents: clip?.pitchCents ?? 0 };
  const speedUp = isBeatSpeedUp(stored);
  const currentBpm = Math.round((baseBpm / stored.stretch) * 10) / 10;
  const maxBpm = maxBeatBpm(baseBpm);
  /** What the slider shows before it is saved. */
  const [draft, setDraft] = useState<number | null>(null);
  /** A change that waits for "yes" because there are recordings already. */
  const [asking, setAsking] = useState<BeatSpeedPlayback | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  // In the simple view on a tablet the menu sits below the tracks: bring it on screen after the tap.
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

  if (!clip) {
    return beatClips.length === 0 ? null : (
      <section className="rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-ink-soft)]" data-testid="studio-beat-speed">
        <p className="font-medium text-[var(--brd-ink)]">{t("tytul")}</p>
        <p>{t("pociety")}</p>
      </section>
    );
  }

  const apply = (next: BeatSpeedPlayback) => {
    setDraft(null);
    if (next.stretch === stored.stretch && next.pitchCents === stored.pitchCents) return;
    if (hasRecordings && !confirmed) {
      setAsking(next);
      return;
    }
    onApply(clip.id, next);
  };
  const toBpm = (target: number) => apply(beatSpeedPlayback(baseBpm, target));
  const normal = () => apply({ stretch: 1, pitchCents: 0 });
  const stepTo = (delta: 1 | -1) => {
    const next = delta > 0 ? Math.floor(currentBpm + 0.05) + 1 : Math.ceil(currentBpm - 0.05) - 1;
    if (next <= baseBpm) normal();
    else toBpm(next);
  };

  const shownStretch = asking?.stretch ?? (draft == null ? stored.stretch : beatSpeedPlayback(baseBpm, draft).stretch);
  const shownBpm = round1(baseBpm / shownStretch);
  const percent = Math.round((1 / shownStretch - 1) * 100);
  const semitones = round1(-12 * Math.log2(shownStretch));
  const betweenKeys = Math.abs(semitones - Math.round(semitones)) > 0.15;
  const locked = disabled || !speedUp || asking !== null;

  return (
    <section ref={rootRef} className="space-y-2 rounded border border-[var(--brd-amber)] p-2" data-testid="studio-beat-speed" aria-label={t("tytul")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-sm font-medium text-[var(--brd-ink)]">{t("tytul")}</p>
        <p className="font-mono text-sm tabular-nums text-[var(--brd-ink)]" data-testid="studio-beat-speed-value">
          {shownBpm} BPM
        </p>
      </div>
      <p className="text-xs text-[var(--brd-mute)]">
        {percent === 0 ? t("normalne", { bpm: round1(baseBpm) }) : t("zmiana", { procent: percent, poltony: semitones })}
      </p>
      {speedUp ? (
        <>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11 shrink-0" disabled={locked || stored.stretch === 1} aria-label={t("wolniej")} data-testid="studio-beat-speed-down" onClick={() => stepTo(-1)}>
              −
            </Button>
            <input
              type="range"
              className="min-h-11 min-w-0 flex-1"
              min={baseBpm}
              max={maxBpm}
              step="any"
              value={draft ?? Math.min(maxBpm, currentBpm)}
              disabled={locked}
              aria-label={t("suwak")}
              aria-valuetext={`${shownBpm} BPM`}
              data-testid="studio-beat-speed-slider"
              onChange={(event) => setDraft(Math.round(Number(event.target.value)))}
              onPointerUp={() => draft != null && toBpm(draft)}
              onKeyUp={() => draft != null && toBpm(draft)}
              onBlur={() => draft != null && toBpm(draft)}
            />
            <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11 shrink-0" disabled={locked || currentBpm >= maxBpm} aria-label={t("szybciej")} data-testid="studio-beat-speed-up" onClick={() => stepTo(1)}>
              +
            </Button>
          </div>
          <p className="text-xs text-[var(--brd-ink-soft)]">{t("opis")}</p>
        </>
      ) : (
        <p className="text-xs text-[var(--brd-ink-soft)]">{t("recznie")}</p>
      )}
      {betweenKeys && percent !== 0 ? <p className="text-xs text-[var(--brd-ink-soft)]">{t("miedzyTonacjami")}</p> : null}
      {asking ? (
        <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" role="alert" data-testid="studio-beat-speed-confirm">
          <p className="text-xs text-[var(--brd-ink)]">{t("maszNagrania")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11 px-3"
              disabled={disabled}
              data-testid="studio-beat-speed-confirm-yes"
              onClick={() => {
                setConfirmed(true);
                setAsking(null);
                onApply(clip.id, asking);
              }}
            >
              {t("zmienTempo")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11 px-3" onClick={() => setAsking(null)}>
              {t("anuluj")}
            </Button>
          </div>
        </div>
      ) : null}
      {stored.stretch !== 1 || stored.pitchCents !== 0 ? (
        <Button type="button" size="sm" variant="outline" className="min-h-11 w-full" disabled={disabled || asking !== null} data-testid="studio-beat-speed-reset" onClick={normal}>
          {t("wroc")}
        </Button>
      ) : null}
    </section>
  );
}

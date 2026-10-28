"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  applyScratchJogDelta,
  approveScratchLive,
  defaultScratchApprovedState,
  defaultScratchLiveState,
  releaseScratchJog,
  setScratchCue,
  setScratchRate,
  studioScratchLivePlaybackRate,
  toggleScratchReverse,
  type StudioScratchApprovedState,
  type StudioScratchLiveState,
} from "@/lib/studio/studio-scratch-state";

type StudioScratchPanelProps = {
  sourceDurationMs: number;
  playheadInSourceMs: number;
  onLiveRate: (rate: number, jogging: boolean) => void;
  onCueJump: (cueMs: number) => void;
};

export function StudioScratchPanel({
  sourceDurationMs,
  playheadInSourceMs,
  onLiveRate,
  onCueJump,
}: StudioScratchPanelProps) {
  const jogId = useId();
  const [approved, setApproved] = useState<StudioScratchApprovedState>(
    defaultScratchApprovedState,
  );
  const [live, setLive] = useState<StudioScratchLiveState>(
    defaultScratchLiveState,
  );
  const lastXRef = useRef<number | null>(null);

  const emitRate = useCallback(
    (next: StudioScratchLiveState) => {
      onLiveRate(studioScratchLivePlaybackRate(next), next.jogging);
    },
    [onLiveRate],
  );

  function applyLive(next: StudioScratchLiveState): void {
    setLive(next);
    emitRate(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastXRef.current = event.clientX;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (lastXRef.current == null) return;
    const delta = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    applyLive(applyScratchJogDelta(live, delta));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    lastXRef.current = null;
    const next = releaseScratchJog(live, approved);
    applyLive(next);
  }

  return (
    <div
      className="space-y-2 rounded border border-[var(--brd-line)] p-2"
      data-testid="studio-scratch-panel"
    >
      <p className="text-xs font-medium text-[var(--brd-ink)]">Scratch DJ v1</p>
      <p className="text-xs text-[var(--brd-mute)]" role="status">
        PARTIAL — jog i tempo na istniejącym transporcie. Reverse live i zapis
        CAS są poza tym pionem.
      </p>
      <div
        id={jogId}
        role="slider"
        tabIndex={0}
        aria-label="Jog Scratch"
        aria-valuemin={25}
        aria-valuemax={400}
        aria-valuenow={Math.round(live.rate * 100)}
        aria-valuetext={`${live.rate.toFixed(2)}×`}
        data-testid="studio-scratch-jog"
        className="flex min-h-11 w-full touch-none items-center justify-center rounded border border-[var(--brd-line)] bg-[var(--brd-bg-soft,transparent)] px-2 text-sm text-[var(--brd-ink)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        Jog · {live.rate.toFixed(2)}×
        {live.jogging ? " · scratch" : ""}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          onClick={() => {
            const next = setScratchCue(live, playheadInSourceMs, sourceDurationMs);
            applyLive(next);
          }}
        >
          Ustaw cue
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          onClick={() => onCueJump(live.cueMs)}
        >
          Wróć do cue ({live.cueMs} ms)
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          aria-pressed={live.reverse}
          onClick={() => applyLive(toggleScratchReverse(live))}
        >
          Reverse {live.reverse ? "wł." : "wył."} (zapis)
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          onClick={() => {
            const nextApproved = approveScratchLive(live);
            setApproved(nextApproved);
            applyLive({ ...nextApproved, jogging: false });
          }}
        >
          Zatwierdź stan
        </Button>
      </div>
      <label className="block text-xs text-[var(--brd-mute)]">
        Tempo (powiązane z pitch)
        <input
          type="range"
          min={25}
          max={400}
          step={1}
          value={Math.round(live.rate * 100)}
          aria-label="Tempo Scratch"
          className="mt-1 w-full"
          onChange={(event) => {
            applyLive(setScratchRate(live, Number(event.target.value) / 100));
          }}
        />
      </label>
    </div>
  );
}

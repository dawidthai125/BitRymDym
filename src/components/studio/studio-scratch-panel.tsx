"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
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
  onLiveRate: (rate: number, reverse: boolean, jogging: boolean) => void;
  onCueJump: (cueMs: number) => void;
  onApprove?: (approved: StudioScratchApprovedState) => void;
};

const JOG_KEYBOARD_STEP = 0.05;

export function StudioScratchPanel({
  sourceDurationMs,
  playheadInSourceMs,
  onLiveRate,
  onCueJump,
  onApprove,
}: StudioScratchPanelProps) {
  const jogId = useId();
  const [approved, setApproved] = useState<StudioScratchApprovedState>(
    defaultScratchApprovedState,
  );
  const [live, setLive] = useState<StudioScratchLiveState>(
    defaultScratchLiveState,
  );
  const liveRef = useRef(live);
  const approvedRef = useRef(approved);
  const lastXRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    approvedRef.current = approved;
  }, [approved]);

  const emitRate = useCallback(
    (next: StudioScratchLiveState) => {
      onLiveRate(
        studioScratchLivePlaybackRate(next),
        next.reverse,
        next.jogging,
      );
    },
    [onLiveRate],
  );

  function applyLive(next: StudioScratchLiveState): void {
    liveRef.current = next;
    setLive(next);
    emitRate(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    // Stop vertical page scroll / Inspector swipe from stealing the jog.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    lastXRef.current = event.clientX;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (lastXRef.current == null) return;
    const delta = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    const padWidth = event.currentTarget.getBoundingClientRect().width;
    applyLive(applyScratchJogDelta(liveRef.current, delta, padWidth));
  }

  function endPointerJog(event: PointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    lastXRef.current = null;
    const next = releaseScratchJog(liveRef.current, approvedRef.current);
    applyLive(next);
  }

  function onJogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      applyLive({
        ...setScratchRate(
          liveRef.current,
          liveRef.current.rate + JOG_KEYBOARD_STEP,
        ),
        jogging: true,
      });
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      applyLive({
        ...setScratchRate(
          liveRef.current,
          liveRef.current.rate - JOG_KEYBOARD_STEP,
        ),
        jogging: true,
      });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applyLive(releaseScratchJog(liveRef.current, approvedRef.current));
      return;
    }
    if (
      (event.key === " " || event.key === "Enter") &&
      liveRef.current.jogging
    ) {
      event.preventDefault();
      applyLive(releaseScratchJog(liveRef.current, approvedRef.current));
    }
  }

  function onJogKeyUp(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      applyLive(releaseScratchJog(liveRef.current, approvedRef.current));
    }
  }

  return (
    <div
      className="space-y-3 rounded border border-[var(--brd-line)] p-2"
      data-testid="studio-scratch-panel"
    >
      <p className="text-xs font-medium text-[var(--brd-ink)]">Scratch DJ v1</p>
      <p className="text-xs text-[var(--brd-mute)]" role="status">
        Przeciągnij jog w poziomie (palec lub mysz). Po puszczeniu wraca do
        zatwierdzonego tempa. Zatwierdź, żeby zapisać CAS.
      </p>
      <div
        id={jogId}
        role="slider"
        tabIndex={0}
        aria-label="Jog Scratch"
        aria-valuemin={25}
        aria-valuemax={400}
        aria-valuenow={Math.round(live.rate * 100)}
        aria-valuetext={`${live.rate.toFixed(2)}×${live.jogging ? " · scratch" : ""}`}
        aria-orientation="horizontal"
        data-testid="studio-scratch-jog"
        className="flex min-h-28 w-full cursor-ew-resize touch-none select-none items-center justify-center rounded-md border-2 border-[var(--brd-line)] bg-[var(--brd-bg-soft,transparent)] px-3 text-base font-medium text-[var(--brd-ink)] active:border-[var(--brd-green)] sm:min-h-16"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerJog}
        onPointerCancel={endPointerJog}
        onLostPointerCapture={() => {
          activePointerIdRef.current = null;
          lastXRef.current = null;
        }}
        onKeyDown={onJogKeyDown}
        onKeyUp={onJogKeyUp}
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
          Reverse {live.reverse ? "wł." : "wył."}
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-full"
          onClick={() => {
            const nextApproved = approveScratchLive(live);
            setApproved(nextApproved);
            approvedRef.current = nextApproved;
            applyLive({ ...nextApproved, jogging: false });
            onApprove?.(nextApproved);
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
          className="mt-2 h-11 w-full accent-[var(--brd-green)]"
          onChange={(event) => {
            applyLive(setScratchRate(live, Number(event.target.value) / 100));
          }}
        />
      </label>
    </div>
  );
}

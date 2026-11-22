"use client";

import { useEffect, useReducer } from "react";

import { BrdAudioPlayButton } from "@/components/brand/brd-audio-play-button";
import { usePlayerOptional } from "@/components/player/player-provider";
import { workClipSrc } from "@/lib/catalog/work-clip";

/**
 * Play / pause of a work's public 45 s clip in the /utwory list. One shared <audio> for the
 * whole list (one clip at a time, nothing preloaded: the clip is fetched only on tap). A beat
 * playing in the global player is paused first. The work page uses the full BrdAudioDeck.
 */
let shared: HTMLAudioElement | null = null;
let currentId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function sharedAudio(): HTMLAudioElement {
  if (!shared) {
    shared = new Audio();
    shared.preload = "none";
    for (const event of ["playing", "pause", "ended", "error", "waiting", "canplay"]) shared.addEventListener(event, emit);
  }
  return shared;
}

export function WorkClipButton({ workId, title, errorLabel }: { workId: string; title: string; errorLabel: string }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const player = usePlayerOptional();

  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
      if (listeners.size === 0 && shared) {
        shared.pause();
        currentId = null;
      }
    };
  }, []);

  const mine = currentId === workId && shared !== null;
  const playing = mine && !shared!.paused && !shared!.ended;
  const loading = playing && shared!.readyState < 3;
  const failed = mine && shared!.error !== null;

  function onClick() {
    const audio = sharedAudio();
    if (playing) {
      audio.pause();
      return;
    }
    if (player?.phase === "playing") player.toggle();
    if (currentId !== workId) {
      audio.pause();
      audio.src = workClipSrc(workId);
      currentId = workId;
    }
    void audio.play().catch(() => emit());
    emit();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <BrdAudioPlayButton playing={playing} loading={loading} size="sm" title={title} onClick={onClick} />
      {failed ? <span role="alert" className="text-xs text-[var(--brd-danger)]">{errorLabel}</span> : null}
    </span>
  );
}

"use client";

import { useRef } from "react";

import { DownloadButton } from "@/components/beats/download-button";
import {
  PlaybackShell,
  type PlaybackShellHandle,
} from "@/components/player/playback-shell";
import { RecordingPanel } from "@/components/takes/recording-panel";

type BeatRecordingSurfaceProps = {
  beatId: string;
  title: string;
  durationSeconds: number;
  /** Server-resolved max recording seconds (entitlement). Display-only on client. */
  maxRecordingSeconds: number;
  beatStatus: string;
  isAuthenticated: boolean;
};

/**
 * Wave 3 composition: PlaybackShell + RecordingPanel siblings sharing a thin sync ref.
 */
export function BeatRecordingSurface({
  beatId,
  title,
  durationSeconds,
  maxRecordingSeconds,
  beatStatus,
  isAuthenticated,
}: BeatRecordingSurfaceProps) {
  const playbackRef = useRef<PlaybackShellHandle | null>(null);

  return (
    <div className="space-y-4">
      <PlaybackShell
        ref={playbackRef}
        beatId={beatId}
        title={title}
        durationSeconds={durationSeconds}
      />
      <RecordingPanel
        beatId={beatId}
        beatDurationSeconds={durationSeconds}
        maxRecordingSeconds={maxRecordingSeconds}
        beatStatus={beatStatus}
        isAuthenticated={isAuthenticated}
        playbackRef={playbackRef}
      />
      <DownloadButton
        beatId={beatId}
        title={title}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}

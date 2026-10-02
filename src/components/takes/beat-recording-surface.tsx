"use client";

import { useRef } from "react";

import { DownloadButton } from "@/components/beats/download-button";
import { MixPanel, type MixTakeOption } from "@/components/mix/mix-panel";
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
  /** READY own takes for this beat (server-filtered). */
  mixTakes?: MixTakeOption[];
  /**
   * Server-resolved Mix presentation gate (AR-W6-01).
   * Do not read E3_MIX_ENABLED on the client.
   */
  mixEnabled?: boolean;
  /** Server-resolved MIX_PRO from E3.2 entitlement. */
  mixPro?: boolean;
  /** Server-resolved MASTER_PRO (E3.4 metering / locked CTA only). */
  masterPro?: boolean;
};

/**
 * Wave 3 composition: PlaybackShell + RecordingPanel siblings sharing a thin sync ref.
 * E3.3/E3.4: MixPanel sibling gated by server-resolved `mixEnabled` (AR-W6-01).
 */
export function BeatRecordingSurface({
  beatId,
  title,
  durationSeconds,
  maxRecordingSeconds,
  beatStatus,
  isAuthenticated,
  mixTakes = [],
  mixEnabled = false,
  mixPro = false,
  masterPro = false,
}: BeatRecordingSurfaceProps) {
  const playbackRef = useRef<PlaybackShellHandle | null>(null);

  return (
    <div className="min-w-0 space-y-4">
      <PlaybackShell
        ref={playbackRef}
        beatId={beatId}
        title={title}
        durationSeconds={durationSeconds}
      />
      <RecordingPanel
        beatId={beatId}
        beatTitle={title}
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
      <MixPanel
        beatId={beatId}
        takes={mixTakes}
        isAuthenticated={isAuthenticated}
        mixEnabled={mixEnabled}
        mixPro={mixPro}
        masterPro={masterPro}
      />
    </div>
  );
}

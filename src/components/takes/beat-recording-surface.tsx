"use client";

import { useLibText } from "@/i18n/use-lib-text";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { MixPanel, type MixTakeOption } from "@/components/mix/mix-panel";
import {
  PlaybackShell,
  type PlaybackShellHandle,
} from "@/components/player/playback-shell";
import { RecordingPanel } from "@/components/takes/recording-panel";
import { signInPathWithNext, signUpPathWithNext } from "@/lib/auth/next-path";

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
 * Fala 4: Download CTA lives once in Beat Detail hero (no duplicate mount here).
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
  const tl = useLibText();
  const tg = useTranslations("beats.recordGuest");
  const pathname = usePathname() ?? "/";
  const playbackRef = useRef<PlaybackShellHandle | null>(null);

  // Owner 2026-10-29: guests cannot record (no guest takes, no Studio).
  if (!isAuthenticated) {
    return (
      <div
        data-testid="beat-record-guest"
        className="min-w-0 space-y-2 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4"
      >
        <p className="text-sm font-medium text-[var(--brd-ink)]">{tg("tytul")}</p>
        <p className="text-sm text-[var(--brd-ink-soft)]">{tg("opis")}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={signInPathWithNext(pathname)}
            className="inline-flex min-h-11 items-center rounded-[var(--brd-r-cta)] border border-[var(--brd-ink)] px-4 text-sm font-medium text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]"
          >
            {tg("zaloguj")}
          </Link>
          <Link
            href={signUpPathWithNext(pathname)}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            {tg("zalozKonto")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <PlaybackShell
        ref={playbackRef}
        beatId={beatId}
        title={tl(title)}
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

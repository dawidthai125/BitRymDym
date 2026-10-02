import Link from "next/link";
import { notFound } from "next/navigation";

import { BeatDetailClient } from "@/app/beat/[id]/beat-detail-client";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { E3_MIX_ENABLED } from "@/config/audio-render";
import { getCurrentProfile } from "@/lib/auth/session";
import { toPublicBeatDetail, toPublicCatalogItem } from "@/lib/beats/public";
import { getPublishedBeat, listPublishedBeats } from "@/lib/beats/service";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";
import { hasAudioCapability } from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  computeAnonymousRecordingMaxSeconds,
  computeRecordingMaxSeconds,
} from "@/lib/takes/entitlement";
import { listOwnTakesFor } from "@/lib/takes/list-own-takes";
import { presentBeat, presentBeats, isTechnicalTitle } from "@/lib/ui/demo-beats";

type BeatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) return { title: "Bit niedostępny" };
  const presented = presentBeat(toPublicBeatDetail(beat));
  return {
    title: presented.title,
    description: beat.description ?? `Odsłuch: ${presented.title}`,
  };
}

export default async function BeatDetailPage({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) notFound();

  const detail = toPublicBeatDetail(beat);
  const presented = presentBeat(detail);
  const audioInfo = await getBeatAudioPublicInfo(beat.id);
  const session = await getCurrentProfile();
  const maxRecordingSeconds = session
    ? computeRecordingMaxSeconds({
        accountLevel: session.profile.accountLevel,
        beatDurationSeconds: detail.durationSeconds,
      })
    : computeAnonymousRecordingMaxSeconds(detail.durationSeconds);

  let mixTakes: Array<{
    id: string;
    label: string;
    durationSeconds: number | null;
  }> = [];
  let mixPro = false;
  let masterPro = false;
  if (session) {
    try {
      const entitlement = await resolveAudioEntitlementForAuthContext(session);
      mixPro = hasAudioCapability(entitlement, "MIX_PRO");
      masterPro = hasAudioCapability(entitlement, "MASTER_PRO");
      const own = await listOwnTakesFor(session);
      mixTakes = own
        .filter((t) => t.beatId === detail.id && t.canPreview)
        .map((t) => ({
          id: t.id,
          label: `Próba · ${t.durationSeconds ?? "?"}s`,
          durationSeconds: t.durationSeconds,
        }));
    } catch {
      mixTakes = [];
    }
  }

  const related = presentBeats(
    (await listPublishedBeats())
      .map(toPublicCatalogItem)
      .filter((b) => b.id !== detail.id)
      .slice(0, 6),
  );

  const safeDescription =
    detail.description && !isTechnicalTitle(detail.description)
      ? detail.description
      : null;

  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="py-6 sm:py-8">
          <Link
            href="/beats"
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            ← Katalog
          </Link>
          <div className="mt-4">
            <BeatDetailClient
              beat={presented}
              description={safeDescription}
              hasAudio={audioInfo.hasAudio}
              isAuthenticated={Boolean(session)}
              maxRecordingSeconds={maxRecordingSeconds}
              mixTakes={mixTakes}
              mixEnabled={E3_MIX_ENABLED === true}
              mixPro={mixPro}
              masterPro={masterPro}
              related={related}
            />
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}

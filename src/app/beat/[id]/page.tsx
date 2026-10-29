import { getLibText } from "@/i18n/get-lib-text";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BeatDetailClient } from "@/app/beat/[id]/beat-detail-client";
import { PageFrame } from "@/components/brand/chrome";
import type { LockReason } from "@/components/plans/locked-action";
import { AppShell } from "@/components/site/app-shell";
import { E3_MIX_ENABLED } from "@/config/audio-render";
import { getCurrentProfile } from "@/lib/auth/session";
import { toPublicBeatDetail, toPublicCatalogItem } from "@/lib/beats/public";
import { getPublishedBeat, listPublishedBeats } from "@/lib/beats/service";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";
import { hasAudioCapability } from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import { loadSamplePolicyDurationOverrides } from "@/lib/takes/sample-policy-settings";
import { listOwnTakesFor } from "@/lib/takes/list-own-takes";
import { presentBeat, presentBeats } from "@/lib/ui/demo-beats";

type BeatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) {
    const t = await getTranslations("beats.beatPage");
    return { title: t("beatUnavailable") };
  }
  const presented = presentBeat(toPublicBeatDetail(beat));
  return {
    title: presented.title,
    description: beat.description ?? `Odsłuch: ${presented.title}`,
  };
}

export default async function BeatDetailPage({ params }: BeatDetailPageProps) {
  const tl = await getLibText();
  const tr = await getTranslations("beats.beatPage");
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) notFound();

  const detail = toPublicBeatDetail(beat);
  const presented = presentBeat(detail);
  const audioInfo = await getBeatAudioPublicInfo(beat.id);
  const session = await getCurrentProfile();
  const overrides = await loadSamplePolicyDurationOverrides();
  let maxRecordingSeconds: number;
  // Owner 2026-10-29: guests and Free listen only — the button stays, locked.
  let downloadLock: LockReason | null = session ? null : "guest";
  if (session) {
    const product = await resolveProductEntitlementForAuthContext(session);
    if (session.profile.role !== "ADMIN" && !(product.limits.downloadsDaily > 0)) {
      downloadLock = "plan";
    }
    maxRecordingSeconds = getSamplePolicy({
      actor: sampleActorFromPremiumTier(product.premiumTier),
      beatDurationSeconds: detail.durationSeconds,
      overrides,
    }).maxRecordingSeconds;
  } else {
    maxRecordingSeconds = getSamplePolicy({
      actor: "ANONYMOUS",
      beatDurationSeconds: detail.durationSeconds,
    }).maxRecordingSeconds;
  }

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
          label: tr("probaS", { v0: t.durationSeconds ?? "?" }),
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

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame className="py-6 sm:py-8">
          <Link
            href="/beats"
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            {tr("katalog")}
          </Link>
          <div className="mt-4">
            <BeatDetailClient
              beat={presented}
              description={tl(detail.description)}
              hasAudio={audioInfo.hasAudio}
              isAuthenticated={Boolean(session)}
              originalMasterDownloadAllowed={beat.ownershipType === "USER"}
              downloadLock={downloadLock}
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

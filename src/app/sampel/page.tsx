import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf, CommunitySource } from "@/components/community/community-shelf";
import { SampleCatalog, type CatalogSampleItem } from "@/components/community/sample-catalog";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { listPublicSamples, type CatalogSource } from "@/lib/community/community-service";
import { LIVE_SAMPLE_INSTRUMENTS, SAMPLE_INSTRUMENTS, SAMPLE_TYPES } from "@/lib/studio/samples/sample-policy";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  return { title: t("samples") };
}

export default async function SampleCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<{ zrodlo?: string }>;
}) {
  const t = await getTranslations("community.catalog");
  const tl = await getTranslations("studio.sampleLab");
  const params = searchParams ? await searchParams : {};
  const source: CatalogSource = params.zrodlo === "brd" ? "brd" : "user";
  const session = await getCurrentProfile();
  const isAdmin = session?.profile.role === "ADMIN";
  const samples = await listPublicSamples(source).catch(() => []);

  const instrumentLabel = (id: string | null) => (id && tl.has(`instrument.${id}`) ? tl(`instrument.${id}`) : id);
  const typeLabel = (id: string | null) => (id && tl.has(`typ.${id}`) ? tl(`typ.${id}`) : null);
  // Newest first from the service; the catalog number counts from the oldest (#01).
  const items: CatalogSampleItem[] = samples
    .map((s, i) => ({
      id: s.id,
      no: samples.length - i,
      title: s.title,
      author: t("by", { name: s.author }),
      durationMs: s.durationMs,
      instrument: s.instrument,
      instrumentLabel: instrumentLabel(s.instrument),
      sampleType: s.sampleType,
      typeLabel: typeLabel(s.sampleType),
      bpm: s.bpm,
      bars: s.bars,
      barsLabel: s.bars ? tl("taktow", { n: s.bars }) : null,
      musicalKey: s.musicalKey,
      platform: s.platform,
    }))
    .reverse();
  const instruments = [...SAMPLE_INSTRUMENTS, ...LIVE_SAMPLE_INSTRUMENTS].map((o) => ({ id: o.id, label: instrumentLabel(o.id) ?? o.id }));
  const types = SAMPLE_TYPES.map((id) => ({ id, label: typeLabel(id) ?? id }));

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="samples" />
          <CommunitySource kind="samples" source={source} />
          {items.length === 0 ? (
            <p className="text-sm text-[var(--brd-mute)]">
              {source === "brd" ? t("samplesEmptyBrd") : t("samplesEmptyUser")}
            </p>
          ) : (
            <SampleCatalog items={items} signedIn={Boolean(session)} isAdmin={isAdmin} instruments={instruments} types={types} />
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}

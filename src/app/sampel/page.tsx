import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf, CommunitySource } from "@/components/community/community-shelf";
import { SampleListen } from "@/components/community/sample-listen";
import { SampleTalk } from "@/components/community/sample-talk";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { listPublicSamples, type CatalogSource } from "@/lib/community/community-service";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  return { title: t("samples") };
}

function secondsLabel(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default async function SampleCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<{ zrodlo?: string }>;
}) {
  const t = await getTranslations("community.catalog");
  const params = searchParams ? await searchParams : {};
  const source: CatalogSource = params.zrodlo === "brd" ? "brd" : "user";
  const session = await getCurrentProfile();
  const samples = await listPublicSamples(source).catch(() => []);
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="samples" />
          <CommunitySource kind="samples" source={source} />
          {samples.length === 0 ? (
            <p className="text-sm text-[var(--brd-mute)]">
              {source === "brd" ? t("samplesEmptyBrd") : t("samplesEmptyUser")}
            </p>
          ) : (
            <ul className="space-y-4">
              {samples.map((sample) => (
                <li id={sample.id} key={sample.id} className="border-b border-[var(--brd-line)] pb-4">
                  <p className="text-base text-[var(--brd-ink)]">{sample.title}</p>
                  <p className="text-sm text-[var(--brd-mute)]">
                    {t("by", { name: sample.author })} · {secondsLabel(sample.durationMs)}
                    {sample.instrument ? ` · ${sample.instrument}` : ""}
                  </p>
                  {session ? <SampleListen id={sample.id} /> : (
                    <Link href="/sign-in" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                      {t("signInListen")}
                    </Link>
                  )}
                  <SampleTalk id={sample.id} signedIn={Boolean(session)} />
                </li>
              ))}
            </ul>
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}

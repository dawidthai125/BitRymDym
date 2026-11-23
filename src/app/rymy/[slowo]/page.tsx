import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { RhymeAttribution, RhymeCta, RhymeSearchForm, RhymeSections } from "@/components/rymy/rhyme-sections";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { findRhymes, hasRhymePage, RYMY_BASE, rhymeCountLabel, rhymePagePath } from "@/lib/rymy/dictionary";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { getPublicSiteUrl } from "@/lib/site-url";

type Props = { params: Promise<{ slowo: string }> };

function wordOf(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function generateMetadata({ params }: Props) {
  const word = wordOf((await params).slowo);
  const result = hasRhymePage(word) ? findRhymes(word) : null;
  if (!result) notFound();
  const sample = [...result.multi, ...result.exact].slice(0, 6).join(", ");
  return pageMetadata({
    title: `Rymy do słowa „${word}” — ${rhymeCountLabel(result.total)}`,
    description: `Rymy do słowa ${word}: ${sample}… Rymy wielosylabowe, dokładne i niedokładne. Znajdź rym i nagraj zwrotkę na darmowym bicie.`,
    path: rhymePagePath(word),
  });
}

export default async function RhymeWordPage({ params }: Props) {
  const word = wordOf((await params).slowo);
  const result = hasRhymePage(word) ? findRhymes(word) : null;
  if (!result) notFound();
  const origin = getPublicSiteUrl();
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript
          data={breadcrumbJsonLd(origin, [
            { name: "Słownik rymów", path: RYMY_BASE },
            { name: `Rymy do „${word}”`, path: rhymePagePath(word) },
          ])}
        />
        <PageFrame className="max-w-3xl space-y-8 py-8 sm:py-10">
          <Link href={RYMY_BASE} className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]">
            ← Słownik rymów
          </Link>
          <header className="space-y-3 border-b-4 border-[var(--brd-ink)] pb-4">
            <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.9]">Rymy do słowa „{word}”</h1>
            <p className="text-[var(--brd-ink-soft)]">
              {rhymeCountLabel(result.total)} do słowa „{word}” ({result.syllables} {result.syllables === 1 ? "sylaba" : result.syllables < 5 ? "sylaby" : "sylab"}), od najczęściej używanych słów.
            </p>
            <RhymeSearchForm />
          </header>
          <RhymeSections result={result} />
          <RhymeCta />
          <RhymeAttribution />
        </PageFrame>
      </main>
    </AppShell>
  );
}

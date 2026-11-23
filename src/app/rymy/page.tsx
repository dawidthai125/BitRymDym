import Link from "@/components/ui/app-link";

import { PageFrame } from "@/components/brand/chrome";
import { RhymeAttribution, RhymeCta, RhymeSearchForm, RhymeSections } from "@/components/rymy/rhyme-sections";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { findRhymes, hasRhymePage, RYMY_BASE, rhymePagePath, rhymePageWords } from "@/lib/rymy/dictionary";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { getPublicSiteUrl } from "@/lib/site-url";

type Props = { searchParams?: Promise<{ q?: string }> };

const POPULAR_ON_INDEX = 300;

export async function generateMetadata({ searchParams }: Props) {
  const q = ((await searchParams)?.q ?? "").trim();
  const meta = await pageMetadata({
    title: "Słownik rymów — rymy do słów dla raperów",
    description:
      "Darmowy słownik rymów: wpisz słowo i znajdź rymy dokładne, wielosylabowe i niedokładne. Rymy do rapu i piosenek, od najczęściej używanych słów.",
    path: RYMY_BASE,
  });
  // Search results are not separate pages for Google.
  return q ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function RhymesIndexPage({ searchParams }: Props) {
  const q = ((await searchParams)?.q ?? "").trim().toLowerCase();
  const result = q ? findRhymes(q) : null;
  const popular = rhymePageWords().slice(0, POPULAR_ON_INDEX).slice().sort((a, b) => a.localeCompare(b, "pl"));
  const origin = getPublicSiteUrl();
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript data={breadcrumbJsonLd(origin, [{ name: "Słownik rymów", path: RYMY_BASE }])} />
        <PageFrame className="max-w-3xl space-y-8 py-8 sm:py-10">
          <header className="space-y-3 border-b-4 border-[var(--brd-ink)] pb-4">
            <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.9]">Słownik rymów</h1>
            <p className="text-[var(--brd-ink-soft)]">
              Wpisz słowo, a pokażemy rymy wielosylabowe, dokładne i niedokładne — od słów, których ludzie używają najczęściej. Za darmo, bez konta.
            </p>
            <RhymeSearchForm defaultValue={q} />
          </header>
          {q ? (
            result ? (
              <section aria-label={`Rymy do ${q}`} className="space-y-4">
                <h2 className="brd-display text-3xl text-[var(--brd-ink)]">Rymy do „{result.word}”</h2>
                {hasRhymePage(result.word) ? (
                  <p className="text-sm">
                    <Link href={rhymePagePath(result.word)} className="underline underline-offset-4">
                      Stała strona: rymy do „{result.word}”
                    </Link>
                  </p>
                ) : null}
                <RhymeSections result={result} />
              </section>
            ) : (
              <p className="text-[var(--brd-ink-soft)]">Wpisz jedno słowo, same litery (np. „miłość”).</p>
            )
          ) : null}
          <RhymeCta />
          <section aria-labelledby="rymy-popularne" className="space-y-3">
            <h2 id="rymy-popularne" className="brd-display text-2xl text-[var(--brd-ink)]">Popularne słowa</h2>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--brd-ink-soft)]" data-testid="rhyme-popular">
              {popular.map((w) => (
                <li key={w}>
                  <Link href={rhymePagePath(w)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                    rymy do {w}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <RhymeAttribution />
        </PageFrame>
      </main>
    </AppShell>
  );
}

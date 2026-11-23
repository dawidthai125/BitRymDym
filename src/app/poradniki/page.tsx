import Link from "next/link";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { GUIDE_BASE, GUIDES, guidePath } from "@/lib/seo/guides";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { getPublicSiteUrl } from "@/lib/site-url";

export function generateMetadata() {
  return pageMetadata({
    title: "Poradniki rapowe — teksty, refreny, nagrywanie, mix i wydanie",
    description:
      "Poradniki dla raperów: jak napisać tekst i refren, co to BPM i tonacja, jak zmiksować wokal, jak zacząć freestyle i jak wydać utwór na Spotify.",
    path: GUIDE_BASE,
  });
}

export default function GuidesIndexPage() {
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript data={breadcrumbJsonLd(getPublicSiteUrl(), [{ name: "Poradniki", path: GUIDE_BASE }])} />
        <PageFrame className="max-w-3xl py-10">
          <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">Poradniki</h1>
          <p className="mt-4 text-[var(--brd-ink-soft)] leading-relaxed">
            Od pustej kartki do premiery: pisanie tekstów, refreny, tempo i tonacja, nagrywanie, mix i wydanie numeru.
          </p>
          <ul className="mt-8 space-y-6" data-testid="guides-list">
            {GUIDES.map((g) => (
              <li key={g.slug} className="border-b border-[var(--brd-line)] pb-5">
                <h2 className="brd-display text-2xl">
                  <Link href={guidePath(g.slug)} className="underline-offset-4 hover:underline">
                    {g.h1}
                  </Link>
                </h2>
                <p className="mt-2 text-[var(--brd-ink-soft)]">{g.metaDescription}</p>
              </li>
            ))}
          </ul>
        </PageFrame>
      </main>
    </AppShell>
  );
}

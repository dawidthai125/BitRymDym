import Link from "@/components/ui/app-link";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { TOOL_PAGES, TOOLS_BASE, toolPath } from "@/lib/seo/tool-pages";
import { getPublicSiteUrl } from "@/lib/site-url";

export function generateMetadata() {
  return pageMetadata({
    title: "Darmowe narzędzia dla raperów — metronom, licznik BPM, sylaby, rymy",
    description:
      "Darmowe narzędzia online dla raperów i producentów: metronom, licznik BPM z pliku i tap tempo, licznik sylab w wersach oraz słownik rymów. Bez konta.",
    path: TOOLS_BASE,
  });
}

const ALL = [
  ...TOOL_PAGES.map((t) => ({ href: toolPath(t.slug), label: t.navLabel, text: t.lead })),
  { href: "/rymy", label: "Słownik rymów", text: "Rymy wielosylabowe, dokładne i niedokładne do ponad 40 tysięcy polskich słów." },
];

export default function ToolsIndexPage() {
  const origin = getPublicSiteUrl();
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript data={breadcrumbJsonLd(origin, [{ name: "Narzędzia", path: TOOLS_BASE }])} />
        <PageFrame className="max-w-3xl space-y-8 py-8 sm:py-10">
          <header className="space-y-3 border-b-4 border-[var(--brd-ink)] pb-4">
            <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.9]">Narzędzia dla raperów</h1>
            <p className="text-[var(--brd-ink-soft)]">Darmowe, w przeglądarce, bez konta. Policz tempo, poćwicz flow z metronomem, wyrównaj wersy i znajdź rymy.</p>
          </header>
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="tools-list">
            {ALL.map((t) => (
              <li key={t.href} className="rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-ink)] p-4">
                <h2 className="brd-display text-2xl">
                  <Link href={t.href} className="underline-offset-4 hover:underline">{t.label}</Link>
                </h2>
                <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">{t.text}</p>
              </li>
            ))}
          </ul>
        </PageFrame>
      </main>
    </AppShell>
  );
}

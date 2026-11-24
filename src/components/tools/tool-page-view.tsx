import Link from "@/components/ui/app-link";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { BpmCounter } from "@/components/tools/bpm-counter";
import { FreestyleTopics } from "@/components/tools/freestyle-topics";
import { Metronome } from "@/components/tools/metronome";
import { MicTest } from "@/components/tools/mic-test";
import { SlowedReverb } from "@/components/tools/slowed-reverb";
import { SyllableCounter } from "@/components/tools/syllable-counter";
import { breadcrumbJsonLd, faqPageJsonLd, webToolJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { TOOL_PAGES, TOOLS_BASE, toolPath, type ToolPage } from "@/lib/seo/tool-pages";
import { getPublicSiteUrl } from "@/lib/site-url";

function Widget({ slug }: { slug: ToolPage["slug"] }) {
  if (slug === "metronom-online") return <Metronome />;
  if (slug === "licznik-bpm") return <BpmCounter />;
  if (slug === "tematy-do-freestyle") return <FreestyleTopics />;
  if (slug === "test-mikrofonu") return <MicTest />;
  if (slug === "slowed-reverb") return <SlowedReverb />;
  return <SyllableCounter />;
}

const CTA: Record<ToolPage["slug"], { href: string; label: string }[]> = {
  "metronom-online": [
    { href: "/darmowe-bity-do-rapu", label: "Darmowe bity do rapu" },
    { href: "/studio-nagran-online", label: "Nagraj zwrotkę online" },
  ],
  "licznik-bpm": [
    { href: "/beats", label: "Bity z BPM i tonacją" },
    { href: "/narzedzia/metronom-online", label: "Metronom online" },
  ],
  "licznik-sylab": [
    { href: "/rymy", label: "Słownik rymów" },
    { href: "/poradniki/jak-napisac-tekst-rapowy", label: "Jak napisać tekst rapowy" },
  ],
  "tematy-do-freestyle": [
    { href: "/bity-do-freestyle", label: "Bity do freestyle" },
    { href: "/poradniki/freestyle-jak-zaczac", label: "Freestyle — jak zacząć" },
  ],
  "test-mikrofonu": [
    { href: "/studio-nagran-online", label: "Nagraj zwrotkę online" },
    { href: "/poradniki/mikrofon-do-rapu", label: "Mikrofon do rapu" },
  ],
  "slowed-reverb": [
    { href: "/mix-i-mastering-online", label: "Mix i mastering online" },
    { href: "/narzedzia/licznik-bpm", label: "Sprawdź BPM i tonację" },
  ],
};

export function ToolPageView({ page }: { page: ToolPage }) {
  const origin = getPublicSiteUrl();
  const path = toolPath(page.slug);
  const others = TOOL_PAGES.filter((t) => t.slug !== page.slug);
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript data={breadcrumbJsonLd(origin, [{ name: "Narzędzia", path: TOOLS_BASE }, { name: page.h1, path }])} />
        <JsonLdScript data={webToolJsonLd(origin, { path, name: page.h1, description: page.metaDescription })} />
        <JsonLdScript data={faqPageJsonLd(origin, { path, items: page.faq })} />
        <PageFrame width="wide" className="py-8 sm:py-10">
          <Link href={TOOLS_BASE} className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]">
            ← Wszystkie narzędzia
          </Link>
          <header className="mb-6 max-w-3xl border-b-4 border-[var(--brd-ink)] pb-4">
            <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">{page.h1}</h1>
            <p className="mt-4 font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--brd-ink-soft)]">{page.lead}</p>
          </header>
          <div className="mb-10 max-w-4xl">
            <Widget slug={page.slug} />
          </div>
          <article className="max-w-3xl space-y-8 text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]" data-testid="tool-copy">
            {page.sections.map((s) => (
              <section key={s.h2} className="space-y-3">
                <h2 className="brd-display text-2xl text-[var(--brd-ink)]">{s.h2}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p.slice(0, 32)}>{p}</p>
                ))}
              </section>
            ))}
            <div className="flex flex-wrap gap-3">
              {CTA[page.slug].map((c, i) => (
                <BrdLink key={c.href} href={c.href} variant={i === 0 ? "primary" : "secondary"}>
                  {c.label}
                </BrdLink>
              ))}
            </div>
            <section aria-labelledby="tool-faq" className="space-y-4 border-t border-[var(--brd-line)] pt-6">
              <h2 id="tool-faq" className="brd-display text-2xl text-[var(--brd-ink)]">Najczęstsze pytania</h2>
              {page.faq.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold text-[var(--brd-ink)]">{f.q}</h3>
                  <p className="mt-1">{f.a}</p>
                </div>
              ))}
            </section>
          </article>
          <nav aria-label="Inne narzędzia" className="mt-10 flex flex-wrap items-center gap-x-4 border-t border-[var(--brd-line)] pt-4 text-sm text-[var(--brd-mute)]">
            <span>Inne narzędzia:</span>
            {others.map((t) => (
              <Link key={t.slug} href={toolPath(t.slug)} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]">
                {t.navLabel}
              </Link>
            ))}
            <Link href="/rymy" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]">Słownik rymów</Link>
          </nav>
        </PageFrame>
      </main>
    </AppShell>
  );
}

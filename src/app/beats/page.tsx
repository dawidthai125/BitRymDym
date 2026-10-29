import { BeatsCatalogClient } from "@/components/brand/beats-catalog-client";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { presentBeats } from "@/lib/ui/demo-beats";

export const metadata = {
  title: "Bity",
  description: "Katalog bitów BitRymDym — odsłuchaj, wybierz i nagraj.",
};

type BeatsPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

/**
 * Fala 3.1 — marketplace catalog polish. Home remains frozen.
 */
export default async function BeatsCatalogPage({ searchParams }: BeatsPageProps) {
  const params = searchParams ? await searchParams : {};
  const raw = (await listPublishedBeats()).map(toPublicCatalogItem);
  const beats = presentBeats(raw);
  const initialQuery =
    typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-4 border-[var(--brd-ink)] pb-4 pt-4 sm:pt-8">
            <div className="min-w-0 space-y-1">
              <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">
                Znajdź swój bit.
              </h1>
              <p className="brd-meta pt-2 text-xs uppercase tracking-[0.14em] text-[var(--brd-green)]">
                {beats.length > 0
                  ? `${beats.length} bitów · słuchaj, potem nagraj`
                  : "Cicho · katalog w drodze"}
              </p>
            </div>
            <p className="max-w-xs pb-1 font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--brd-ink-soft)]">
              Czysta lista bitów. Bez banerów i hustlu.
            </p>
          </header>

          {beats.length === 0 ? (
            <div className="border border-[var(--brd-line)] px-5 py-12 text-center">
              <p className="brd-display text-xl font-semibold">Cicho.</p>
              <p className="mt-2 text-sm text-[var(--brd-mute)]">
                Nie ma jeszcze opublikowanych bitów.
              </p>
            </div>
          ) : (
            <BeatsCatalogClient beats={beats} initialQuery={initialQuery} />
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}

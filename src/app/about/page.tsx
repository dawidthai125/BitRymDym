import { AppShell } from "@/components/site/app-shell";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";

export const metadata = {
  title: "O BitRymDym",
  description: "Platforma do bitów, nagrań i tworzenia numerów.",
};

export default function AboutPage() {
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-2xl py-12">
          <SectionLabel>O BitRymDym</SectionLabel>
          <h1 className="brd-display mt-2 text-4xl font-semibold tracking-tight">
            Bit. Głos. Studio.
          </h1>
          <div className="mt-6 space-y-4 text-[var(--brd-ink-soft)] leading-relaxed">
            <p>
              BitRymDym to miejsce, w którym znajdujesz bity, nagrywasz swój głos
              i rozwijasz numery — bez zbędnego szumu.
            </p>
            <p>
              Dla producentów, raperów i twórców, którzy chcą wracać tu codziennie:
              odsłuchać, nagrać, wrócić do studia.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <BrdLink href="/beats">Przeglądaj bity</BrdLink>
            <BrdLink href="/sign-up" variant="secondary">
              Załóż konto
            </BrdLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}

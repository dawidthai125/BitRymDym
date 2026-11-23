import Link from "@/components/ui/app-link";

import { hasRhymePage, rhymePagePath, type RhymeResult } from "@/lib/rymy/dictionary";

function WordList({ words }: { words: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {words.map((w) => (
        <li key={w}>
          {hasRhymePage(w) ? (
            <Link href={rhymePagePath(w)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              {w}
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center">{w}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Result blocks: multi-syllable, exact, near rhymes. */
export function RhymeSections({ result }: { result: RhymeResult }) {
  const blocks = [
    { id: "wielosylabowe", h2: "Rymy wielosylabowe (najmocniejsze)", note: "Zgadzają się trzy ostatnie sylaby — brzmią najmocniej w zwrotce.", words: result.multi },
    { id: "dokladne", h2: "Rymy dokładne", note: "Ta sama końcówka od akcentowanej sylaby.", words: result.exact },
    { id: "niedokladne", h2: "Rymy niedokładne", note: "Inna samogłoska pod akcentem, ta sama końcówka — popularne w rapie.", words: result.near },
  ].filter((b) => b.words.length > 0);
  if (blocks.length === 0) return <p className="text-[var(--brd-ink-soft)]">Nie znaleźliśmy rymów do tego słowa w naszym słowniku.</p>;
  return (
    <div className="space-y-8" data-testid="rhyme-results">
      {blocks.map((b) => (
        <section key={b.id} aria-labelledby={`rymy-${b.id}`} className="space-y-2">
          <h2 id={`rymy-${b.id}`} className="brd-display text-2xl text-[var(--brd-ink)]">
            {b.h2} <span className="brd-meta text-sm text-[var(--brd-mute)]">({b.words.length})</span>
          </h2>
          <p className="text-sm text-[var(--brd-mute)]">{b.note}</p>
          <WordList words={b.words} />
        </section>
      ))}
    </div>
  );
}

export function RhymeSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/rymy" method="get" role="search" className="flex flex-wrap gap-2" data-testid="rhyme-search">
      <label htmlFor="rymy-q" className="sr-only">
        Słowo
      </label>
      <input
        id="rymy-q"
        name="q"
        defaultValue={defaultValue}
        placeholder="np. miłość, życie, ulica"
        autoComplete="off"
        className="min-h-11 flex-1 rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-ink-soft)] bg-transparent px-3 text-[var(--brd-ink)]"
      />
      <button
        type="submit"
        className="min-h-11 rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-green)] bg-[var(--brd-green)] px-5 font-semibold text-[var(--primary-foreground)]"
      >
        Szukaj rymów
      </button>
    </form>
  );
}

export function RhymeCta() {
  return (
    <aside className="rounded-[var(--brd-r-cta)] border border-[var(--brd-line)] p-4 text-[var(--brd-ink-soft)]" data-testid="rhyme-cta">
      <p className="font-semibold text-[var(--brd-ink)]">Masz rymy? Nagraj zwrotkę.</p>
      <p className="mt-1 text-sm">
        Wybierz <Link href="/darmowe-bity-do-rapu" className="underline underline-offset-4">darmowy bit do rapu</Link>, nagraj wokal w{" "}
        <Link href="/studio-nagran-online" className="underline underline-offset-4">Studiu online</Link> i sprawdź{" "}
        <Link href="/poradniki/jak-napisac-tekst-rapowy" className="underline underline-offset-4">jak napisać tekst rapowy</Link>.
      </p>
    </aside>
  );
}

export function RhymeAttribution() {
  return (
    <p className="mt-10 border-t border-[var(--brd-line)] pt-4 text-xs text-[var(--brd-mute)]">
      Lista słów: <a href="https://github.com/hermitdave/FrequencyWords" className="underline" rel="noopener">FrequencyWords</a> (Hermit Dave, dane OpenSubtitles), licencja{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pl" className="underline" rel="noopener">CC BY-SA 4.0</a>, sprawdzona ze słownikiem{" "}
      <a href="https://sjp.pl" className="underline" rel="noopener">SJP.PL</a> (CC BY 4.0). Rymy wyznaczamy automatycznie według wymowy, więc mogą się zdarzyć niedokładności.
    </p>
  );
}

"use client";

import { useMemo, useState } from "react";

import { countLines, summarize } from "@/lib/tools/syllables";
import { toolInput, toolPanel } from "@/components/tools/tool-ui";

const EXAMPLE = "Nagrywam zwrotkę, kiedy miasto śpi\nbit leci w słuchawkach, a ja liczę dni";

/** Syllables per line of lyrics, with the deviation from the verse average. */
export function SyllableCounter() {
  const [text, setText] = useState(EXAMPLE);
  const lines = useMemo(() => countLines(text), [text]);
  const total = summarize(lines);
  return (
    <section className={toolPanel} aria-label="Licznik sylab" data-testid="tool-syllables">
      <label htmlFor="sylaby-tekst" className="font-semibold text-[var(--brd-ink)]">Wklej tekst — jedna linijka = jeden wers</label>
      <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
        <textarea
          id="sylaby-tekst"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className={`${toolInput} py-2 font-mono text-sm leading-7`}
          spellCheck={false}
        />
        <ol className="brd-meta min-w-28 pt-[10px] text-sm leading-7 text-[var(--brd-ink-soft)]" aria-label="Sylaby w wersach" data-testid="syllable-lines">
          {lines.map((l, i) => {
            const diff = l.words > 0 && total.average > 0 ? l.syllables - total.average : 0;
            return (
              <li key={i} className="h-7 overflow-hidden">
                {l.words > 0 ? (
                  <>
                    <strong className="text-[var(--brd-ink)]">{l.syllables}</strong> syl.
                    {Math.abs(diff) >= 2 ? <span className="ml-1 text-[var(--brd-mute)]">({diff > 0 ? "+" : ""}{Math.round(diff)})</span> : null}
                  </>
                ) : (
                  " "
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-3 text-sm text-[var(--brd-ink-soft)]" aria-live="polite">
        Wersy: <strong>{total.lines}</strong> · sylaby: <strong>{total.syllables}</strong> · słowa: <strong>{total.words}</strong> · średnio na wers: <strong>{total.average}</strong>
      </p>
      <p className="mt-1 text-xs text-[var(--brd-mute)]">W nawiasie: o ile wers odbiega od średniej (pokazujemy od 2 sylab). Liczymy samogłoski; „i” przed samogłoską („nie”, „się”) nie jest osobną sylabą.</p>
    </section>
  );
}

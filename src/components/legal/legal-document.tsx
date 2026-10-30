import { Fragment, type ReactNode } from "react";

import type { LegalBlock, LegalDoc } from "@/content/legal/types";
import { PLACEHOLDER_RE } from "@/lib/legal/legal-config";

/** Placeholders like [NIP] are highlighted so missing operator data is impossible to miss. */
function withMarks(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={m.index} className="rounded-[2px] bg-[var(--brd-gold,#d39b3a)]/25 px-1 text-[var(--brd-ink)]" data-placeholder>{m[0]}</mark>);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

function Block({ b }: { b: LegalBlock }) {
  if (typeof b === "string") return <p>{withMarks(b)}</p>;
  if ("list" in b) return <ul className="list-disc space-y-1 pl-5">{b.list.map((x, i) => <li key={i}>{withMarks(x)}</li>)}</ul>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr>{b.table.head.map((h) => <th key={h} className="border-b border-[var(--brd-line)] py-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-[var(--brd-line)] py-2 pr-4 align-top">{withMarks(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function LegalDocument({ doc, englishNote }: { doc: LegalDoc; englishNote?: string | null }) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 py-10 text-[15px] leading-relaxed" lang="pl" data-testid="legal-document">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="text-[var(--brd-mute)]">{withMarks(doc.lead)}</p>
        <p className="rounded-[2px] border border-dashed border-[var(--brd-line)] p-3 text-sm" role="note" data-testid="legal-template-note">
          Wersja robocza (wzór) — przed publikacją wymaga uzupełnienia danych w [nawiasach] i weryfikacji przez prawnika. Nie stanowi porady prawnej. Wersja: {doc.version}.
        </p>
        {englishNote ? <p className="text-sm text-[var(--brd-mute)]" lang="en">{englishNote}</p> : null}
      </header>
      <nav aria-label="Spis treści" className="text-sm">
        <ol className="flex flex-col gap-1">{doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="underline-offset-4 hover:underline">{s.h}</a></li>)}</ol>
      </nav>
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">{s.h}</h2>
          {s.blocks.map((b, i) => <Block key={i} b={b} />)}
        </section>
      ))}
    </article>
  );
}

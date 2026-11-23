/**
 * Title and description of a catalogue sample page /sampel/[id] (pure, client-safe).
 * studio_samples has no description column, so the copy is built only from stored facts
 * (type, instrument, tempo, bars, key) and the product rule: samples are free, there is
 * no file download, they are used in the Studio.
 */
export type SampleMetaInput = {
  title: string;
  sampleType: string | null;
  typeLabel: string | null;
  instrumentLabel: string | null;
  bpm: number | null;
  barsLabel: string | null;
  musicalKey: string | null;
  locale: "pl" | "en";
};

function facts(s: SampleMetaInput): string[] {
  const key = s.musicalKey ? (s.locale === "en" ? `key or note ${s.musicalKey}` : `tonacja lub nuta ${s.musicalKey}`) : null;
  return [s.typeLabel, s.instrumentLabel, s.bpm ? `${Math.round(s.bpm)} BPM` : null, s.barsLabel, key].filter(
    (v): v is string => Boolean(v),
  );
}

export function sampleMetaTitle(s: SampleMetaInput): string {
  const tail = [s.instrumentLabel, s.bpm ? `${Math.round(s.bpm)} BPM` : null].filter(Boolean).join(", ");
  const head = s.locale === "en" ? "free rap sample" : "darmowy sampel do rapu";
  return `${s.title} — ${head}${tail ? `: ${tail}` : ""}`;
}

/** Paragraphs shown on the page; the first one is also the meta description. */
export function sampleDescription(s: SampleMetaInput): string[] {
  const list = facts(s).join(", ");
  if (s.locale === "en") {
    const use =
      s.sampleType === "loop"
        ? "It is a loop: repeat it bar by bar to build the backbone of a track."
        : s.sampleType === "phrase"
          ? "It is a phrase: drop it in once or let it come back between verses."
          : s.sampleType === "oneshot"
            ? "It is a one-shot: place single hits exactly where you need them."
            : null;
    return [
      `Free sample “${s.title}”${list ? ` (${list})` : ""}. Listen on the site and use it in your project in the BitRymDym Studio.`,
      [use, "The file can't be downloaded — you add the sample to a project in the Studio, in the Sample tab."].filter(Boolean).join(" "),
    ];
  }
  const use =
    s.sampleType === "loop"
      ? "To pętla: powtarzasz ją takt po takcie i budujesz na niej szkielet numeru."
      : s.sampleType === "phrase"
        ? "To fraza: wrzuć ją raz albo niech wraca między zwrotkami."
        : s.sampleType === "oneshot"
          ? "To pojedynczy dźwięk: stawiasz go dokładnie tam, gdzie go potrzebujesz."
          : null;
  return [
    `Darmowy sampel „${s.title}”${list ? ` (${list})` : ""}. Odsłuchaj na stronie i użyj w swoim projekcie w Studiu BitRymDym.`,
    [use, "Pliku nie da się pobrać — sampel dodajesz do projektu w Studiu, w zakładce Sample."].filter(Boolean).join(" "),
  ];
}

/** Closest samples first: same instrument, then same type, then tempo distance. */
export function relatedSamples<T extends { id: string; instrument: string | null; sampleType: string | null; bpm: number | null }>(
  target: T,
  all: readonly T[],
  limit = 6,
): T[] {
  const score = (s: T) =>
    (s.instrument && s.instrument === target.instrument ? 0 : 100) +
    (s.sampleType && s.sampleType === target.sampleType ? 0 : 50) +
    (s.bpm && target.bpm ? Math.min(40, Math.abs(s.bpm - target.bpm)) : 40);
  return all.filter((s) => s.id !== target.id).sort((a, b) => score(a) - score(b)).slice(0, limit);
}

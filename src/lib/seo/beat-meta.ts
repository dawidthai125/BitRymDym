/**
 * Search-friendly <title> and meta description for /beat/[id] (pure, client-safe).
 * Puts the phrases people search for ("darmowy bit trap 98 BPM", "bit na wyłączność")
 * next to the beat title. Facts only from the beat row; no invented key or mood.
 */
export type BeatMetaInput = {
  title: string;
  genre: string | null;
  bpm: number;
  key: string | null;
  description: string | null;
  /** "free" | "paid" lane of a platform beat; null for user beats. */
  lane: "free" | "paid" | null;
  locale: "pl" | "en";
};

const MAX_DESCRIPTION = 158;

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

function genreWord(genre: string | null, locale: "pl" | "en"): string {
  const g = (genre ?? "").trim();
  if (!g) return locale === "en" ? "rap" : "";
  return locale === "en" ? g : g.toLowerCase();
}

export function beatMetaTitle(b: BeatMetaInput): string {
  const g = genreWord(b.genre, b.locale);
  const bpm = b.bpm > 0 ? ` ${b.bpm} BPM` : "";
  if (b.locale === "en") {
    if (b.lane === "paid") return `${b.title} — exclusive ${g} beat${bpm}`;
    if (b.lane === "free") return `${b.title} — free ${g} rap beat${bpm}`;
    return `${b.title} — ${g} beat${bpm}`;
  }
  const gp = g ? ` ${g}` : "";
  if (b.lane === "paid") return `${b.title} — bit${gp}${bpm} na wyłączność`;
  if (b.lane === "free") return `${b.title} — darmowy bit${gp}${bpm} do rapu`;
  return `${b.title} — bit${gp}${bpm}`;
}

export function beatMetaDescription(b: BeatMetaInput): string {
  const g = genreWord(b.genre, b.locale);
  const facts = [b.bpm > 0 ? `${b.bpm} BPM` : null, b.key ? (b.locale === "en" ? `key ${b.key}` : `tonacja ${b.key}`) : null]
    .filter(Boolean)
    .join(", ");
  const f = facts ? ` (${facts})` : "";
  let lead: string;
  if (b.locale === "en") {
    lead = b.lane === "paid"
      ? `Exclusive ${g} beat “${b.title}”${f}: only one buyer, then it leaves the catalogue.`
      : b.lane === "free"
        ? `Free ${g} rap beat “${b.title}”${f}. Listen and record your verse online in your browser.`
        : `${g} beat “${b.title}”${f} on BitRymDym.`;
  } else {
    const gp = g ? ` ${g}` : "";
    lead = b.lane === "paid"
      ? `Bit${gp} na wyłączność „${b.title}”${f}: tylko jeden kupiec, potem znika z katalogu.`
      : b.lane === "free"
        ? `Darmowy bit${gp} „${b.title}”${f}. Odsłuchaj i nagraj zwrotkę online w przeglądarce.`
        : `Bit${gp} „${b.title}”${f} w BitRymDym.`;
  }
  const extra = (b.description ?? "").replace(/\s+/g, " ").trim();
  return clamp(extra ? `${lead} ${extra}` : lead, MAX_DESCRIPTION);
}

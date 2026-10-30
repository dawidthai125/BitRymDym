/**
 * Large-file transport under the Supabase 50 MB per-object cap: any object larger
 * than PART_BYTES is stored as `<key>.p000`, `<key>.p001`, … (raw byte slices).
 * Readers concatenate parts in order; `<key>` itself wins when it exists.
 */
export const PART_BYTES = 40 * 1024 * 1024;
const PART_RE = /^(.+)\.p(\d{3})$/;

export const partName = (base: string, i: number) => `${base}.p${String(i).padStart(3, "0")}`;
export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_BYTES));

/** Names (within one dir listing) that make up `base`, in order; [] when absent. */
export function partsOf(names: string[], base: string): string[] {
  if (names.includes(base)) return [base];
  return names
    .map((n) => PART_RE.exec(n))
    .filter((m): m is RegExpExecArray => !!m && m[1] === base)
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map((m) => m[0]);
}

/** Distinct logical file names in a listing (parts collapsed to their base). */
export function logicalNames(names: string[]): string[] {
  return [...new Set(names.map((n) => PART_RE.exec(n)?.[1] ?? n))].sort();
}

const PL: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

/** "Mój Numer!" → "moj-numer" (safe ASCII, Polish letters transliterated). */
export function slugTitle(title: string | null | undefined): string {
  const s = (title ?? "").toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => PL[c] ?? c)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
  return s || "bitrymdym";
}

const FMT_TAG: Record<string, string> = { MP3_128: "128", MP3_192: "192", MP3_320: "320", WAV_24: "wav24", WAV_FLOAT: "wav", ZIP: "", MP4: "1080p" };

/** moj-numer_master_320.mp3 / moj-numer_projekt.zip / moj-numer_youtube_1080p.mp4 */
export function downloadFilename(title: string | null | undefined, kind: string, format: string, ext: string): string {
  const tag = FMT_TAG[format] ?? format.toLowerCase();
  return `${slugTitle(title)}_${kind}${tag ? `_${tag}` : ""}.${ext}`;
}

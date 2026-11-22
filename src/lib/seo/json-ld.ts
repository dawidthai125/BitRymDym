/**
 * schema.org JSON-LD for public pages (pure, client-safe).
 * Serialized through serializeJsonLd so DB text cannot close the <script> tag
 * (Next.js JSON-LD guide: escape "<").
 */
import { absoluteUrl } from "@/lib/share/share-links";

export type JsonLdObject = { [key: string]: JsonLdValue };
type JsonLdValue = string | number | boolean | null | undefined | JsonLdObject | JsonLdValue[];

/** JSON.stringify safe for an inline <script type="application/ld+json">. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** 205 → "PT3M25S"; null for missing / non-positive durations. */
export function isoDuration(totalSeconds: number | null | undefined): string | null {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const safe = Math.round(totalSeconds);
  if (safe <= 0) return null;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

function clean(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  return v && v !== "—" ? v : undefined;
}

function person(name: string | null | undefined): JsonLdObject | undefined {
  const n = clean(name);
  return n ? { "@type": "Person", name: n } : undefined;
}

function imageUrl(origin: string, image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  return /^https?:\/\//.test(image) ? image : absoluteUrl(origin, image);
}

export type BeatRecordingInput = {
  origin: string;
  id: string;
  title: string;
  producer: string | null | undefined;
  genre: string | null | undefined;
  style?: string | null;
  tags?: readonly string[];
  bpm?: number | null;
  /** Presented key, e.g. "Am". */
  musicalKey?: string | null;
  durationSeconds?: number | null;
  description?: string | null;
  /** Site-relative or absolute image path (approved cover or OG card). */
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
};

/** MusicRecording for /beat/[id]. Tempo and key go to additionalProperty (no schema.org field). */
export function beatRecordingJsonLd(input: BeatRecordingInput): JsonLdObject {
  const url = absoluteUrl(input.origin, `/beat/${input.id}`);
  const keywords = [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))];
  const extra: JsonLdObject[] = [];
  if (typeof input.bpm === "number" && Number.isFinite(input.bpm) && input.bpm > 0) {
    extra.push({ "@type": "PropertyValue", name: "tempo", value: Math.round(input.bpm), unitText: "BPM" });
  }
  const key = clean(input.musicalKey);
  if (key) extra.push({ "@type": "PropertyValue", name: "musicalKey", value: key });
  const genre = [clean(input.genre), clean(input.style)].filter((g): g is string => Boolean(g));
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    "@id": url,
    name: input.title,
    url,
    byArtist: person(input.producer),
    duration: isoDuration(input.durationSeconds) ?? undefined,
    genre: genre.length > 1 ? [...new Set(genre)] : genre[0],
    image: imageUrl(input.origin, input.image),
    description: clean(input.description),
    keywords: keywords.length ? keywords.join(", ") : undefined,
    datePublished: clean(input.datePublished),
    dateModified: clean(input.dateModified),
    additionalProperty: extra.length ? extra : undefined,
  };
}

export type WorkRecordingInput = {
  origin: string;
  id: string;
  title: string;
  author: string | null | undefined;
  datePublished?: string | null;
  /** Site-relative or absolute image path (e.g. the OG card). */
  image?: string | null;
};

/** MusicRecording for /utwor/[id] (finished user track). */
export function workRecordingJsonLd(input: WorkRecordingInput): JsonLdObject {
  const url = absoluteUrl(input.origin, `/utwor/${input.id}`);
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    "@id": url,
    name: input.title,
    url,
    byArtist: person(input.author),
    image: imageUrl(input.origin, input.image),
    datePublished: clean(input.datePublished),
  };
}

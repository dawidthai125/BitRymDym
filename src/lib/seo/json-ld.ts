/**
 * schema.org JSON-LD for public pages (pure, client-safe).
 * Serialized through serializeJsonLd so DB text cannot close the <script> tag
 * (Next.js JSON-LD guide: escape "<").
 */
import { SOCIAL_PROFILES } from "@/lib/seo/social";
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

const BRAND = "BitRymDym";
const LOGO_PATH = "/brand/bitrymdym-logo.png";

/** Organization behind the site (home page). */
export function organizationJsonLd(origin: string): JsonLdObject {
  const url = absoluteUrl(origin, "/");
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${url}#organization`,
    name: BRAND,
    url,
    logo: absoluteUrl(origin, LOGO_PATH),
    email: "kontakt@bitrymdym.pl",
    sameAs: SOCIAL_PROFILES.map((p) => p.url),
  };
}

/** WebSite entity (home page): site name for Google results. */
export function websiteJsonLd(origin: string, description: string): JsonLdObject {
  const url = absoluteUrl(origin, "/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}#website`,
    name: BRAND,
    url,
    inLanguage: "pl-PL",
    description,
    publisher: { "@id": `${url}#organization` },
  };
}

/** Browser Studio as a free web application (home page). */
export function webApplicationJsonLd(origin: string, description: string): JsonLdObject {
  const url = absoluteUrl(origin, "/");
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${BRAND} Studio`,
    url,
    description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    inLanguage: "pl-PL",
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    publisher: { "@id": `${url}#organization` },
  };
}

export type BreadcrumbItem = { name: string; path: string };

/** BreadcrumbList; the last item is the current page. */
export function breadcrumbJsonLd(origin: string, items: readonly BreadcrumbItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(origin, item.path),
    })),
  };
}

/** ItemList of beat pages for catalogue / genre pages (summary list: URLs only). */
export function beatListJsonLd(
  origin: string,
  input: { name: string; path: string; beats: readonly { id: string; title: string }[]; max?: number },
): JsonLdObject {
  return itemListJsonLd(origin, {
    name: input.name,
    path: input.path,
    items: input.beats.map((beat) => ({ path: `/beat/${beat.id}`, name: beat.title })),
    max: input.max,
  });
}

/** ItemList of any catalogue (samples, tracks): URLs only. */
export function itemListJsonLd(
  origin: string,
  input: { name: string; path: string; items: readonly { path: string; name: string }[]; max?: number },
): JsonLdObject {
  const items = input.items.slice(0, input.max ?? 50);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.name,
    url: absoluteUrl(origin, input.path),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(origin, item.path),
      name: item.name,
    })),
  };
}

/** FAQPage for keyword landing pages (questions answered on the page itself). */
export function faqPageJsonLd(
  origin: string,
  input: { path: string; items: readonly { q: string; a: string }[] },
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${absoluteUrl(origin, input.path)}#faq`,
    mainEntity: input.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** Article for /poradniki/[slug] (publisher = site Organization). */
export function articleJsonLd(
  origin: string,
  input: { path: string; headline: string; description: string; datePublished: string; dateModified?: string },
): JsonLdObject {
  const url = absoluteUrl(origin, input.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: url,
    inLanguage: "pl-PL",
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: { "@type": "Organization", name: "BitRymDym", url: absoluteUrl(origin, "/") },
    publisher: { "@type": "Organization", name: "BitRymDym", url: absoluteUrl(origin, "/") },
  };
}

/** Windows recorder (/nagrywarka): free desktop app, same account as the site. */
export function recorderAppJsonLd(origin: string, input: { name: string; description: string }): JsonLdObject {
  const url = absoluteUrl(origin, "/nagrywarka");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${url}#app`,
    name: input.name,
    description: input.description,
    url,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Windows 10, Windows 11",
    // ffmpeg (Gyan build) needs Windows 10; the program is 64-bit only.
    softwareRequirements: "Windows 10 or 11, 64-bit",
    inLanguage: ["pl-PL", "en"],
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    publisher: { "@id": `${absoluteUrl(origin, "/")}#organization` },
  };
}

/** Promo film on the home page (/promo/jak-to-dziala.mp4). */
export function promoVideoJsonLd(origin: string, input: { name: string; description: string; uploadDate: string }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.name,
    description: input.description,
    thumbnailUrl: [absoluteUrl(origin, "/promo/jak-to-dziala-poster.jpg")],
    contentUrl: absoluteUrl(origin, "/promo/jak-to-dziala.mp4"),
    uploadDate: input.uploadDate,
    inLanguage: "pl-PL",
    publisher: { "@id": `${absoluteUrl(origin, "/")}#organization` },
  };
}

/** Free browser tool (/narzedzia/<slug>): WebApplication, free, no install. */
export function webToolJsonLd(origin: string, input: { path: string; name: string; description: string }): JsonLdObject {
  const url = absoluteUrl(origin, input.path);
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${url}#app`,
    name: input.name,
    description: input.description,
    url,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and Web Audio",
    inLanguage: "pl-PL",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    publisher: { "@id": `${absoluteUrl(origin, "/")}#organization` },
  };
}

/** YouTube video of a beat page (VideoObject → video results in Google). */
export function beatVideoJsonLd(origin: string, input: { beatId: string; videoId: string; name: string; description: string; uploadDate: string }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.name,
    description: input.description,
    thumbnailUrl: [`https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`],
    uploadDate: input.uploadDate,
    embedUrl: `https://www.youtube-nocookie.com/embed/${input.videoId}`,
    contentUrl: `https://www.youtube.com/watch?v=${input.videoId}`,
    url: absoluteUrl(origin, `/beat/${input.beatId}`),
    inLanguage: "pl-PL",
    publisher: { "@id": `${absoluteUrl(origin, "/")}#organization` },
  };
}

export type SampleRecordingInput = {
  origin: string;
  id: string;
  title: string;
  author: string | null | undefined;
  durationSeconds?: number | null;
  bpm?: number | null;
  musicalKey?: string | null;
  description?: string | null;
  datePublished?: string | null;
};

/** MusicRecording for /sampel/[id]: free to listen, no contentUrl (samples are not downloadable). */
export function sampleRecordingJsonLd(input: SampleRecordingInput): JsonLdObject {
  const url = absoluteUrl(input.origin, `/sampel/${input.id}`);
  const extra: JsonLdObject[] = [];
  if (input.bpm && input.bpm > 0) extra.push({ "@type": "PropertyValue", name: "tempo", value: Math.round(input.bpm), unitText: "BPM" });
  const key = clean(input.musicalKey);
  if (key) extra.push({ "@type": "PropertyValue", name: "musicalKey", value: key });
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    "@id": url,
    name: input.title,
    url,
    byArtist: person(input.author),
    duration: isoDuration(input.durationSeconds) ?? undefined,
    description: clean(input.description),
    datePublished: clean(input.datePublished),
    isAccessibleForFree: true,
    additionalProperty: extra.length ? extra : undefined,
  };
}

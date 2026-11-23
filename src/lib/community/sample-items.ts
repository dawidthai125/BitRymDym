import type { CatalogSampleItem } from "@/components/community/sample-catalog";
import type { PublicSampleCard } from "@/lib/community/community-service";
import { catalogSampleNumbers } from "@/lib/community/share-policy";

type Labels = {
  by: (name: string) => string;
  instrument: (id: string | null) => string | null;
  type: (id: string | null) => string | null;
  bars: (n: number) => string;
};

/** Catalogue rows (list and sample page) with stable numbers, newest number first. */
export function toCatalogSampleItems(samples: readonly PublicSampleCard[], labels: Labels): CatalogSampleItem[] {
  // Stored catalog number (studio_samples.sample_number): stays the same whatever the sort or filter.
  const numberOf = catalogSampleNumbers(samples);
  return samples
    .map((s, i) => ({
      id: s.id,
      no: numberOf.get(s.id) ?? samples.length - i,
      title: s.title,
      author: labels.by(s.author),
      durationMs: s.durationMs,
      instrument: s.instrument,
      instrumentLabel: labels.instrument(s.instrument),
      sampleType: s.sampleType,
      typeLabel: labels.type(s.sampleType),
      bpm: s.bpm,
      bars: s.bars,
      barsLabel: s.bars ? labels.bars(s.bars) : null,
      musicalKey: s.musicalKey,
      description: s.description,
      descriptionEn: s.descriptionEn,
      platform: s.platform,
      ratingAvg: s.ratingAvg,
      ratingCount: s.ratingCount,
    }))
    .sort((a, b) => b.no - a.no);
}

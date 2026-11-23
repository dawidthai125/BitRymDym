"use client";

import { useLibText } from "@/i18n/use-lib-text";
import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";

import { PurchasedWavButton } from "@/components/beats/purchased-wav-button";

type PurchasedCatalogBeat = {
  id: string;
  title: string;
  producer: string | null;
  bpm: number;
};

export function PurchasedCatalogList({ beats }: { beats: PurchasedCatalogBeat[] }) {
  const tl = useLibText();
  const t = useTranslations("beats.beatsPage");

  if (beats.length === 0) {
    return (
      <p className="border border-[var(--brd-line)] px-5 py-10 text-sm text-[var(--brd-mute)]" data-testid="purchased-catalog-empty">
        {t("mojPusto")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]" data-testid="purchased-catalog">
      {beats.map((beat) => (
        <li key={beat.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="purchased-catalog-row">
          <div className="min-w-0">
            <Link href={`/beat/${beat.id}`} className="font-medium text-[var(--brd-ink)] underline-offset-4 hover:underline">
              {tl(beat.title)}
            </Link>
            <p className="text-sm text-[var(--brd-mute)]">
              {tl(beat.producer?.trim() || "—")}
              {" · "}
              {beat.bpm} BPM
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PurchasedWavButton beatId={beat.id} title={beat.title} />
            <Link
              href={`/studio?beatId=${encodeURIComponent(beat.id)}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--brd-green)] underline underline-offset-4"
            >
              {t("nagrajWStudio")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

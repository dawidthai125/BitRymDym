import { useTranslations } from "next-intl";
import Image from "next/image";

import { artworkVariantToVisual } from "@/lib/ui/demo-visuals";
import { cn } from "@/lib/utils";

type BeatArtworkProps = {
  variant: number;
  title: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Approved owner cover (served by /api/beats/[id]/cover). */
  coverUrl?: string | null;
};

const sizeClass: Record<NonNullable<BeatArtworkProps["size"]>, string> = {
  xs: "size-11",
  sm: "size-16 sm:size-[4.75rem]",
  md: "size-24 sm:size-28",
  lg: "aspect-square w-full max-w-[20rem]",
  xl: "aspect-square w-full max-w-[28rem]",
};

/**
 * Photo-like beat artwork from local demo catalog.
 * Deterministic by variant — no Storage bucket.
 */
export function BeatArtwork({
  variant,
  title,
  className,
  size = "sm",
  coverUrl,
}: BeatArtworkProps) {
  const t = useTranslations("common.beatArtwork");
  const visual = artworkVariantToVisual(variant);

  return (
    <div
      role="img"
      aria-label={t("okladka", { v0: title })}
      className={cn(
        "relative shrink-0 overflow-hidden border border-[var(--brd-line)] bg-[var(--brd-graphite)]",
        sizeClass[size],
        className,
      )}
    >
      {coverUrl ? (
        // Owner cover: already square WebP from our API (no next/image proxy).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
      <Image
        src={visual.src}
        alt=""
        fill
        sizes={
          size === "xl" || size === "lg"
            ? "(max-width: 768px) 80vw, 28rem"
            : size === "md"
              ? "7rem"
              : size === "xs"
                ? "2.75rem"
                : "5rem"
        }
        className="object-cover"
        style={{ objectPosition: visual.focus }}
      />
      )}
      <div
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/25"
        aria-hidden
      />
    </div>
  );
}

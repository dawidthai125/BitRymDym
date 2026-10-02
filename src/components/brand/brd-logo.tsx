import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Official BitRymDym lockup — crown + wordmark + BITY · RYMY · DYM */
export const BRD_LOGO_SRC = "/brand/bitrymdym-logo.png" as const;

/** Intrinsic pixel size of public/brand/bitrymdym-logo.png (tight crop). */
export const BRD_LOGO_INTRINSIC = { width: 720, height: 369 } as const;

type BrdLogoProps = {
  className?: string;
  /** Display height in CSS pixels (width follows aspect). */
  height?: number;
  priority?: boolean;
};

/**
 * Brand lockup image (no link). Prefer {@link BrdLogoHomeLink} in the header.
 */
export function BrdLogo({
  className,
  height = 48,
  priority = false,
}: BrdLogoProps) {
  const width = Math.round(
    (height * BRD_LOGO_INTRINSIC.width) / BRD_LOGO_INTRINSIC.height,
  );

  return (
    <Image
      src={BRD_LOGO_SRC}
      alt="BitRymDym"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto", className)}
      style={{ height, width: "auto" }}
    />
  );
}

type BrdLogoHomeLinkProps = {
  className?: string;
  priority?: boolean;
};

/**
 * Clickable home brand mark for the global header.
 * Width-led (~+45% vs first pass): mobile 88px · desktop 120px.
 * Fits existing header row — no structure/menu changes.
 */
export function BrdLogoHomeLink({
  className,
  priority = true,
}: BrdLogoHomeLinkProps) {
  const width = 120;
  const height = Math.round(
    (width * BRD_LOGO_INTRINSIC.height) / BRD_LOGO_INTRINSIC.width,
  );

  return (
    <Link
      href="/"
      aria-label="Strona główna BitRymDym"
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center self-center py-0 pr-1 sm:pr-2",
        className,
      )}
    >
      <Image
        src={BRD_LOGO_SRC}
        alt="BitRymDym"
        width={width}
        height={height}
        priority={priority}
        sizes="(max-width: 640px) 176px, 240px"
        className="h-auto w-[5.5rem] object-contain object-left sm:w-[7.5rem]"
      />
    </Link>
  );
}

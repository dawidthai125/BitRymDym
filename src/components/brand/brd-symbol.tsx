import Image from "next/image";

import { cn } from "@/lib/utils";

export const BRD_SYMBOL_SRC = "/brand/bitrymdym-symbol.png" as const;
export const BRD_SYMBOL_INVERSE_SRC =
  "/brand/bitrymdym-symbol-inverse.png" as const;

/** Intrinsic size of public/brand/bitrymdym-symbol.png */
export const BRD_SYMBOL_INTRINSIC = { width: 809, height: 866 } as const;

export type BrdSymbolVariant = "primary" | "inverse";

type BrdSymbolProps = {
  variant?: BrdSymbolVariant;
  /** Display size in CSS pixels (square box, contain). */
  size?: number;
  className?: string;
  /** Decorative by default (alt=\"\"). Set when symbol is meaningful alone. */
  decorative?: boolean;
  priority?: boolean;
};

/**
 * BitRymDym brand mark — BRD + crown only (not the full wordmark lockup).
 */
export function BrdSymbol({
  variant = "primary",
  size = 32,
  className,
  decorative = true,
  priority = false,
}: BrdSymbolProps) {
  const src =
    variant === "inverse" ? BRD_SYMBOL_INVERSE_SRC : BRD_SYMBOL_SRC;

  return (
    <Image
      src={src}
      alt={decorative ? "" : "BitRymDym"}
      width={size}
      height={size}
      priority={priority}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
      aria-hidden={decorative || undefined}
    />
  );
}

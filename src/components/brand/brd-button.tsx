import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-green-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)] disabled:pointer-events-none disabled:opacity-45";

const variants = {
  primary:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-green)] bg-[var(--brd-green)] text-[var(--brd-paper)] hover:bg-[var(--brd-green-soft)] hover:border-[var(--brd-green-soft)]",
  secondary:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-ink)] bg-transparent text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
  ghost:
    "rounded-[var(--brd-r-cta)] border-transparent bg-transparent text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
  danger:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-rec)] bg-[var(--brd-rec)] text-[var(--brd-paper)] hover:opacity-90",
  onDark:
    "rounded-[var(--brd-r-cta)] border-[color-mix(in_srgb,var(--brd-paper)_70%,transparent)] bg-[var(--brd-paper)] text-[var(--brd-ink)] hover:bg-[color-mix(in_srgb,var(--brd-paper)_88%,transparent)]",
  bare: "rounded-none border-transparent px-0 text-[var(--brd-green)] underline-offset-4 hover:underline",
} as const;

type Variant = keyof typeof variants;

type BrdButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
};

export function BrdButton({
  className,
  variant = "primary",
  type = "button",
  ...props
}: BrdButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], className)}
      {...props}
    />
  );
}

type BrdLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
};

export function BrdLink({
  className,
  variant = "primary",
  ...props
}: BrdLinkProps) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props} />
  );
}

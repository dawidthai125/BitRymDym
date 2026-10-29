import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 border px-4 font-poster text-base font-bold uppercase tracking-[0.08em] transition-[color,background-color,border-color,transform,box-shadow] duration-[var(--tape-dur-fast)] ease-[var(--tape-ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brd-paper)] disabled:pointer-events-none disabled:opacity-45";

const variants = {
  primary:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-green)] bg-[var(--brd-green)] text-[var(--primary-foreground)] shadow-[0_3px_0_0_var(--brd-green-muted)] hover:bg-[var(--brd-green-soft)] hover:border-[var(--brd-green-soft)] active:translate-y-[3px] active:shadow-none",
  secondary:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-ink-soft)] bg-transparent text-[var(--brd-ink)] hover:border-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
  ghost:
    "rounded-[var(--brd-r-cta)] border-transparent bg-transparent text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)] hover:bg-[var(--brd-paper-deep)]",
  danger:
    "rounded-[var(--brd-r-cta)] border-[var(--brd-rec)] bg-[var(--brd-rec)] text-[var(--brd-paper)] hover:opacity-90",
  onDark:
    "rounded-[var(--brd-r-cta)] border-[color-mix(in_srgb,var(--brd-on-media)_70%,transparent)] bg-[var(--brd-on-media)] text-[var(--brd-recess)] hover:bg-[color-mix(in_srgb,var(--brd-on-media)_88%,transparent)]",
  bare: "rounded-none border-transparent px-0 font-ui normal-case tracking-normal text-[var(--brd-green)] underline-offset-4 hover:underline",
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

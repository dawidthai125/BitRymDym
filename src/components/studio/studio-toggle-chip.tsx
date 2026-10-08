"use client";

import { Button } from "@/components/ui/button";

/** Shared Studio toggle chip (Mute/Solo/Record Arm / FX bypass). */
export function StudioToggleChip({
  active,
  label,
  title,
  onClick,
  disabled,
  className,
  tone = "default",
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Visual emphasis only — same boolean toggle contract. */
  tone?: "default" | "mute" | "solo" | "record";
}) {
  const activeClass =
    tone === "record" && active
      ? "border-[var(--brd-rec)] bg-[var(--brd-rec)] text-[var(--brd-paper)] hover:opacity-90"
      : tone === "solo" && active
        ? "border-[var(--brd-warn)] bg-[var(--brd-warn)] text-[var(--brd-paper)] hover:opacity-90"
        : undefined;

  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      title={title}
      aria-pressed={active}
      aria-label={title}
      disabled={disabled}
      className={[
        className ?? "min-h-11 min-w-11 px-3",
        "font-mono text-xs tracking-wide",
        activeClass,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

"use client";

import { Button } from "@/components/ui/button";

/** Shared Studio toggle chip (Mute/Solo/FX bypass). */
export function StudioToggleChip({
  active,
  label,
  title,
  onClick,
  disabled,
  className,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      title={title}
      aria-pressed={active}
      aria-label={title}
      disabled={disabled}
      className={className ?? "min-h-11 min-w-11 px-3"}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

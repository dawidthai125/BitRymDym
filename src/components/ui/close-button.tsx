import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one way to close a dialog, sheet or panel: an X icon with a spoken label.
 * Do not add a second text button next to it.
 */
export function CloseButton({
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size" | "variant" | "aria-label"> & { label: string }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn("size-11 shrink-0", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </Button>
  );
}

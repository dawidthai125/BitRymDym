import Image from "next/image";

import { getDemoVisual, type DemoVisualId } from "@/lib/ui/demo-visuals";
import { cn } from "@/lib/utils";

type VisualSceneProps = {
  kind: DemoVisualId;
  className?: string;
  label?: string;
  caption?: string;
  /** Soft dark veil for overlay UI readability */
  dim?: boolean;
  priority?: boolean;
  /** Override default object-position */
  focus?: string;
};

/**
 * Photo-driven scene for Home / product surfaces.
 * Local demo assets only — CSS geometry is fallback, not primary.
 */
export function VisualScene({
  kind,
  className,
  label,
  caption,
  dim = false,
  priority = false,
  focus,
}: VisualSceneProps) {
  const visual = getDemoVisual(kind);

  return (
    <div
      className={cn("relative overflow-hidden bg-[var(--brd-graphite)]", className)}
      role="img"
      aria-label={label ?? visual.alt}
    >
      <Image
        src={visual.src}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 60vw"
        className="object-cover"
        style={{ objectPosition: focus ?? visual.focus }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />
      {dim ? (
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(10,14,12,0.78)_100%)]"
          aria-hidden
        />
      ) : null}
      {caption ? (
        <p className="absolute bottom-3 left-3 right-3 brd-meta text-[10px] uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--brd-paper)_75%,transparent)]">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

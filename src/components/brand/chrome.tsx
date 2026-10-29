import { cn } from "@/lib/utils";

export function MetaLine({
  items,
  className,
}: {
  items: Array<string | null | undefined | false>;
  className?: string;
}) {
  const visible = items.filter(Boolean) as string[];
  if (visible.length === 0) return null;
  return (
    <p className={cn("brd-meta text-xs text-[var(--brd-mute)]", className)}>
      {visible.join(" · ")}
    </p>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "rec" | "green";
  className?: string;
}) {
  /** Hardware label: recessed plate + status LED. Calm — no glow. */
  const leds = {
    neutral: "bg-[var(--brd-mute)]",
    ok: "bg-[var(--brd-ok)]",
    warn: "bg-[var(--brd-warn)]",
    rec: "bg-[var(--brd-rec)]",
    green: "bg-[var(--brd-green)]",
  } as const;

  return (
    <span
      className={cn(
        "brd-hw-label inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--brd-ink-soft)]",
        className,
      )}
      data-tone={tone}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", leds[tone])} />
      {children}
    </span>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-sm font-semibold text-[var(--brd-ink-soft)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PageFrame({
  children,
  className,
  width = "public",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "public" | "wide" | "reading" | "ops" | "full";
}) {
  const max =
    width === "full"
      ? "max-w-none"
      : width === "wide"
        ? "max-w-[var(--brd-max-wide)]"
        : width === "ops"
          ? "max-w-[var(--brd-max-ops)]"
          : width === "reading"
            ? "max-w-[var(--brd-max-reading)]"
            : "max-w-[var(--brd-max-public)]";

  return (
    <div
      className={cn(
        "mx-auto w-full px-[max(var(--brd-gutter),env(safe-area-inset-left))] pr-[max(var(--brd-gutter),env(safe-area-inset-right))]",
        max,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 12-column product grid wrapper */
export function ProductGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-[var(--brd-col-gap)] md:grid-cols-8 lg:grid-cols-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

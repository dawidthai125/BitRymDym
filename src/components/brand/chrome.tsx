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
  const tones = {
    neutral: "border-[var(--brd-line)] text-[var(--brd-ink-soft)]",
    ok: "border-[var(--brd-ok)] text-[var(--brd-ok)]",
    warn: "border-[var(--brd-warn)] text-[var(--brd-warn)]",
    rec: "border-[var(--brd-rec)] text-[var(--brd-rec)]",
    green: "border-[var(--brd-green)] text-[var(--brd-green)]",
  } as const;

  return (
    <span
      className={cn(
        "brd-meta inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        tones[tone],
        className,
      )}
    >
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
        "brd-meta text-[11px] uppercase tracking-[0.18em] text-[var(--brd-mute)]",
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

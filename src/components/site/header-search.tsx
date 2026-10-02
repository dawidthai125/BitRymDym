"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * Search UI only — no backend. Routes to catalog for Fala 3+ filtering.
 */
export function HeaderSearch({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    router.push(trimmed ? `/beats?q=${encodeURIComponent(trimmed)}` : "/beats");
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className={cn("relative", className)}
    >
      <label htmlFor="brd-header-search" className="sr-only">
        Szukaj bitów
      </label>
      <input
        id="brd-header-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={compact ? "Szukaj" : "Szukaj bitów…"}
        autoComplete="off"
        className={cn(
          "min-h-10 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm text-[var(--brd-ink)] placeholder:text-[var(--brd-mute)] outline-none focus-visible:border-[var(--brd-green)] focus-visible:ring-1 focus-visible:ring-[var(--brd-green-soft)]",
          compact ? "max-w-[7.5rem] md:max-w-[11rem]" : "max-w-[14rem]",
        )}
      />
    </form>
  );
}

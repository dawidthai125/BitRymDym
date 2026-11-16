"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Persistent admin sections. Layout stays mounted while the page under it changes. */
export function AdminSectionNav({
  items,
  label,
}: {
  items: readonly { href: string; label: string; exact?: boolean }[];
  label: string;
}) {
  const path = usePathname();
  return (
    <nav
      className="flex flex-wrap gap-1 overflow-x-auto text-sm text-[var(--brd-ink-soft)]"
      aria-label={label}
    >
      {items.map((item) => {
        const on = item.exact
          ? path === item.href
          : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "inline-flex min-h-11 items-center px-2 text-[var(--brd-ink)] underline decoration-[var(--brd-green)]"
                : "inline-flex min-h-11 items-center px-2 hover:text-[var(--brd-ink)]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

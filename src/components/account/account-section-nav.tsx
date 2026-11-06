"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Persistent profile sections. The account layout keeps this mounted while the page under it changes. */
export function AccountSectionNav({
  items,
  label,
}: {
  items: readonly { href: string; label: string }[];
  label: string;
}) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-2" aria-label={label}>
      {items.map((item) => {
        const on =
          item.href === "/account"
            ? path === "/account"
            : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "inline-flex min-h-11 items-center border border-[var(--brd-green)] px-4 text-sm text-[var(--brd-green)]"
                : "inline-flex min-h-11 items-center border border-[var(--brd-line)] px-4 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-green)] hover:text-[var(--brd-green)]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

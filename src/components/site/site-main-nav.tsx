"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isSiteNavHrefActive,
  siteNavLinkClass,
} from "@/components/site/site-nav-active";
import { cn } from "@/lib/utils";

const items = [
  { href: "/beats", label: "Bity" },
  { href: "/about", label: "O nas" },
  { href: "/studio", label: "Studio" },
  { href: "/premium", label: "Premium" },
] as const;

/**
 * Desktop primary nav (lg+). Mirrors mobile aria-current="page" for the current route.
 */
export function SiteMainNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center lg:flex" aria-label="Główne menu">
      {items.map((item) => {
        const active = isSiteNavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              siteNavLinkClass,
              active && "text-[var(--brd-ink)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

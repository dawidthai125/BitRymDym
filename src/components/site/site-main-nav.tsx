"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isSiteNavHrefActive,
  siteNavLinkClass,
} from "@/components/site/site-nav-active";
import { cn } from "@/lib/utils";

const items = [
  { href: "/beats", label: "beats" },
  { href: "/about", label: "about" },
  { href: "/studio", label: "studio" },
  { href: "/premium", label: "premium" },
] as const;

/**
 * Desktop primary nav (lg+). Mirrors mobile aria-current="page" for the current route.
 */
export function SiteMainNav() {
  const t = useTranslations("nav.siteMainNav");
  const tItem = useTranslations("nav.items");
  const pathname = usePathname();

  return (
    <nav className="hidden items-center lg:flex" aria-label={t("glowneMenu")}>
      {items.map((item) => {
        const active = isSiteNavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              siteNavLinkClass,
              active &&
                "text-[var(--brd-ink)] underline decoration-[var(--brd-green)]",
            )}
          >
            {tItem(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}

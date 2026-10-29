"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isSiteNavHrefActive } from "@/components/site/site-nav-active";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  isAuthenticated: boolean;
};

const itemsAuth = [
  { href: "/beats", label: "beats" },
  { href: "/studio", label: "studio" },
  { href: "/library", label: "library" },
  { href: "/profile", label: "profile" },
] as const;

const itemsGuest = [
  { href: "/beats", label: "beats" },
  { href: "/about", label: "about" },
  { href: "/sign-in", label: "signIn" },
] as const;

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const t = useTranslations("nav.mobileBottomNav");
  const tItem = useTranslations("nav.items");
  const pathname = usePathname();
  const items = isAuthenticated ? itemsAuth : itemsGuest;

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--brd-line)] bg-[var(--brd-paper)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={t("nawigacjaMobilna")}
    >
      <ul
        className={cn(
          "mx-auto grid max-w-lg",
          isAuthenticated ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {items.map((item) => {
          const active = isSiteNavHrefActive(pathname, item.href, {
            studioIncludesAccount: true,
          });

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 font-poster text-sm font-bold uppercase tracking-[0.12em]",
                  active
                    ? "text-[var(--brd-ink)]"
                    : "text-[var(--brd-mute)]",
                )}
              >
                <span
                  className={cn(
                    "h-1 w-8",
                    active
                      ? "bg-[var(--brd-green)] shadow-[0_0_10px_0_var(--brd-green)]"
                      : "bg-[var(--brd-line)]",
                  )}
                  aria-hidden
                />
                {tItem(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

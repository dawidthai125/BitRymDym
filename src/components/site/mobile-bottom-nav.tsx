"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  isAuthenticated: boolean;
};

const itemsAuth = [
  { href: "/beats", label: "Bity" },
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Biblioteka" },
  { href: "/profile", label: "Profil" },
] as const;

const itemsGuest = [
  { href: "/beats", label: "Bity" },
  { href: "/about", label: "O nas" },
  { href: "/sign-in", label: "Zaloguj" },
] as const;

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const pathname = usePathname();
  const items = isAuthenticated ? itemsAuth : itemsGuest;

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_96%,transparent)] pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Nawigacja mobilna"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-lg",
          isAuthenticated ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {items.map((item) => {
          const active =
            item.href === "/studio"
              ? pathname.startsWith("/studio") || pathname.startsWith("/account")
              : item.href === "/library"
                ? pathname.startsWith("/library")
                : item.href === "/profile"
                  ? pathname.startsWith("/profile")
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] tracking-wide",
                  active
                    ? "text-[var(--brd-green)]"
                    : "text-[var(--brd-mute)]",
                )}
              >
                <span
                  className={cn(
                    "h-0.5 w-6",
                    active ? "bg-[var(--brd-green)]" : "bg-transparent",
                  )}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

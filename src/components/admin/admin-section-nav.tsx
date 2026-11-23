"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AdminNavItem = { href: string; label: string; exact?: boolean };
export type AdminNavGroup = { label: string; items: readonly AdminNavItem[] };

function isOn(path: string, item: AdminNavItem): boolean {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

/**
 * Admin sections in labelled groups. Desktop: sticky sidebar. Phone: one scrollable row.
 * The layout stays mounted while the page under it changes.
 */
export function AdminSectionNav({ groups, label }: { groups: readonly AdminNavGroup[]; label: string }) {
  const path = usePathname();
  // The most specific match wins (e.g. /admin/beats/new over /admin/beats).
  const all = groups.flatMap((g) => g.items);
  const active = all
    .filter((item) => isOn(path, item))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label={label} className="text-sm">
      {/* Phone / tablet: one row */}
      <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden">
        {all.map((item) => (
          <li key={item.href} className="shrink-0">
            <NavLink item={item} on={item.href === active} compact />
          </li>
        ))}
      </ul>
      {/* Desktop: grouped sidebar */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 font-mono text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} on={item.href === active} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, on, compact }: { item: AdminNavItem; on: boolean; compact?: boolean }) {
  return (
    <Link
      href={item.href}
      prefetch
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center rounded-md px-3 transition-colors",
        compact && "whitespace-nowrap border border-[var(--brd-line)]",
        on
          ? "bg-[var(--brd-paper-deep)] font-semibold text-[var(--brd-ink)] shadow-[inset_3px_0_0_var(--brd-amber)]"
          : "text-[var(--brd-ink-soft)] hover:bg-[var(--brd-paper-deep)] hover:text-[var(--brd-ink)]",
      )}
    >
      {item.label}
    </Link>
  );
}

"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";

import { ACCOUNT_TABS, activeAccountTab, isAccountPageActive, type AccountTabId } from "@/lib/account/account-tabs";

const BASE = "inline-flex min-h-11 shrink-0 items-center border px-4 text-sm";
const ON = `${BASE} border-[var(--brd-green)] text-[var(--brd-green)]`;
const OFF = `${BASE} border-[var(--brd-line)] text-[var(--brd-ink)] hover:border-[var(--brd-green)] hover:text-[var(--brd-green)]`;
const SUB = "inline-flex min-h-11 shrink-0 items-center border-b-2 px-2 text-sm";

/** Persistent profile sections. The account layout keeps this mounted while the page under it changes. */
export function AccountSectionNav({
  tabLabels,
  pageLabels,
  label,
}: {
  tabLabels: Record<AccountTabId, string>;
  pageLabels: Record<string, string>;
  label: string;
}) {
  const path = usePathname();
  const active = activeAccountTab(path);
  const group = ACCOUNT_TABS.find((tab) => tab.id === active);
  return (
    <>
      <nav className="flex flex-wrap gap-2 pb-1" aria-label={label}>
        {ACCOUNT_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.pages[0].href}
            prefetch
            aria-current={tab.id === active ? (tab.pages.length > 1 ? "true" : "page") : undefined}
            className={tab.id === active ? ON : OFF}
          >
            {tabLabels[tab.id]}
          </Link>
        ))}
      </nav>
      {group && group.pages.length > 1 ? (
        <nav className="mt-2 flex flex-wrap gap-x-3" aria-label={tabLabels[group.id]} data-testid="account-subnav">
          {group.pages.map((page) => {
            const on = isAccountPageActive(path, page.href);
            return (
              <Link
                key={page.href}
                href={page.href}
                prefetch
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? `${SUB} border-[var(--brd-green)] text-[var(--brd-ink)]`
                    : `${SUB} border-transparent text-[var(--brd-mute)] hover:text-[var(--brd-ink)]`
                }
              >
                {pageLabels[page.id]}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}

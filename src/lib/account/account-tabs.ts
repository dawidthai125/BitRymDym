/** Profile tabs (pure): five groups, each with the pages that belong to it. */

export type AccountTabId = "overview" | "takes" | "library" | "works" | "settings";

export const ACCOUNT_TABS: readonly { id: AccountTabId; pages: readonly { id: string; href: string }[] }[] = [
  { id: "overview", pages: [{ id: "overview", href: "/account" }] },
  { id: "takes", pages: [{ id: "takes", href: "/account/takes" }] },
  {
    id: "library",
    pages: [
      { id: "favorites", href: "/account/favorites" },
      { id: "downloads", href: "/account/downloads" },
      { id: "purchased", href: "/account/purchased" },
      { id: "shared", href: "/account/shared" },
    ],
  },
  {
    id: "works",
    pages: [
      { id: "catalog", href: "/account/catalog" },
      { id: "beats", href: "/account/beats" },
    ],
  },
  {
    id: "settings",
    pages: [
      { id: "settings", href: "/account/settings" },
      { id: "publicProfile", href: "/account/profil" },
    ],
  },
];

export function isAccountPageActive(path: string, href: string): boolean {
  return href === "/account" ? path === "/account" : path === href || path.startsWith(`${href}/`);
}

export function activeAccountTab(path: string): AccountTabId | null {
  return ACCOUNT_TABS.find((tab) => tab.pages.some((page) => isAccountPageActive(path, page.href)))?.id ?? null;
}

const SETTINGS_HASHES = new Set(["#profil", "#security", "#powiadomienia", "#danger"]);

/** Sections that moved from the overview to settings. */
export function settingsPathForHash(hash: string): string | null {
  return SETTINGS_HASHES.has(hash) ? `/account/settings${hash}` : null;
}

import type { ListingConsents } from "@/lib/community/consents";

/** Search by title (pure): case and Polish marks do not matter. */
export function foldTitle(text: string): string {
  return text.toLocaleLowerCase("pl").replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function filterListings<T extends { title: string }>(items: readonly T[], query: string): T[] {
  const q = foldTitle(query.trim());
  return q ? items.filter((item) => foldTitle(item.title).includes(q)) : [...items];
}

/** What a closed row says. */
export function listingSummaryKeys(consents: ListingConsents): ("off" | "listed" | "ratings" | "comments" | "ranking")[] {
  if (!consents.listed) return ["off"];
  return [
    "listed",
    ...(consents.allowRatings ? (["ratings"] as const) : []),
    ...(consents.allowComments ? (["comments"] as const) : []),
    ...(consents.inRankings ? (["ranking"] as const) : []),
  ];
}

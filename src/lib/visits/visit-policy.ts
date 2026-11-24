/**
 * Cookieless entry counter (pure). Counts how many times the site was opened from outside and
 * from where. Reads only request headers the browser sends anyway; nothing is stored on the
 * device and no identifier leaves this module (see site_visits migration).
 */
import { isStaffDevice } from "@/lib/analytics/consent";
import { isDocumentRequest } from "@/lib/auth/keep-signed-in";
import { isLikelyBot } from "@/lib/funnel/funnel-request";

/** Middleware → root layout. Always removed from the incoming request first. */
export const VISIT_HEADER = "x-brd-visit";

export const VISIT_SOURCES = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "bluesky",
  "x",
  "reddit",
  "google",
  "search",
  "ai",
  "mail",
  "direct",
  "other",
] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

const IN_APP: [RegExp, VisitSource][] = [
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB/, "facebook"],
  [/musical_ly|Bytedance|TikTok/i, "tiktok"],
];

const HOSTS: [RegExp, VisitSource][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)bsky\.app$/, "bluesky"],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, "x"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/^(mail|outlook|poczta|webmail)\./, "mail"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, "ai"],
  [/(^|\.)google\.[a-z.]{2,6}$/, "google"],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|yandex\.[a-z.]{2,6})$/, "search"],
];

/** Payment provider and our own hosts: coming back is not a new entry. */
const NOT_ENTRIES = /(^|\.)(payu\.com|payu\.pl|bitrymdym\.(pl|com|eu|online|com\.pl))$/;

function hostOf(referer: string | null): string | null {
  try {
    return referer ? new URL(referer).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Traffic source, or null when the request is not an entry from outside. */
export function visitSource(headers: Headers, utmSource: string | null): VisitSource | null {
  const host = hostOf(headers.get("referer"));
  if (host && NOT_ENTRIES.test(host)) return null;
  const utm = utmSource?.trim().toLowerCase() ?? "";
  const byUtm = VISIT_SOURCES.find((s) => s === utm);
  if (byUtm) return byUtm;
  if (host) {
    const byHost = HOSTS.find(([re]) => re.test(host));
    if (byHost) return byHost[1];
  }
  const ua = headers.get("user-agent") ?? "";
  const inApp = IN_APP.find(([re]) => re.test(ua));
  if (inApp) return inApp[1];
  return host ? "other" : "direct";
}

/** Areas that are not the public site. */
const SKIPPED = /^\/(admin|api|auth|email|maintenance|offline)(\/|$)/;

/** Header value for a page opened from outside by a person; null = do not count. */
export function visitHeaderValue(input: {
  method: string;
  headers: Headers;
  pathname: string;
  utmSource: string | null;
  cookieHeader: string | null;
}): string | null {
  const { method, headers, pathname } = input;
  if (!isDocumentRequest(method, headers)) return null;
  const site = headers.get("sec-fetch-site");
  if (site !== "none" && site !== "cross-site") return null;
  if (SKIPPED.test(pathname) || isStaffDevice(input.cookieHeader)) return null;
  if (isLikelyBot(headers.get("user-agent"))) return null;
  const source = visitSource(headers, input.utmSource);
  return source ? `${source} ${encodeURIComponent(pathname.slice(0, 200))}` : null;
}

export function parseVisitHeader(value: string | null): { source: VisitSource; pathname: string } | null {
  const [source, encoded, ...rest] = (value ?? "").split(" ");
  const known = VISIT_SOURCES.find((s) => s === source);
  if (!known || !encoded || rest.length > 0) return null;
  try {
    return { source: known, pathname: decodeURIComponent(encoded) };
  } catch {
    return null;
  }
}

/** Pages shown one by one; anything with an id in the address is a group. */
const PAGES = new Set([
  "about", "account", "autotune-online", "beats", "bity-do-freestyle", "bity-na-wylacznosc", "cookies",
  "darmowe-bity-do-rapu", "forgot-password", "jak-nagrac", "library", "mastering", "mix-i-mastering-online",
  "nagrywanie-rapu-w-domu", "nagrywarka", "narzedzia", "podklady-do-rapu", "polityka-prywatnosci", "poradniki",
  "premium", "program-do-nagrywania-rapu", "ranking", "regulamin", "rymy", "sampel", "settings", "sign-in",
  "sign-up", "studio", "studio-nagran-online", "utwory",
]);
const GROUPS = new Set(["beat", "listen", "profile", "r", "tworca", "utwor"]);

/** Bounded page key for site_visits.path. `isKnown` answers for guide and tool slugs. */
export function visitPath(pathname: string, isKnown: (section: "poradniki" | "narzedzia", slug: string) => boolean): string {
  const clean = pathname.toLowerCase().replace(/\/+$/, "").replace(/^\/en(?=\/|$)/, "");
  if (clean === "") return "/";
  const [first = "", second] = clean.slice(1).split("/");
  if (GROUPS.has(first)) return `/${first}`;
  if (!PAGES.has(first)) return "inne";
  if (second && (first === "poradniki" || first === "narzedzia")) {
    return isKnown(first, second) ? `/${first}/${second}` : "inne";
  }
  return `/${first}`;
}

export type VisitStatRow = { kind: string; key: string; views: number };
export type VisitStats = {
  total: number;
  days: { key: string; views: number }[];
  sources: { key: string; views: number }[];
  paths: { key: string; views: number }[];
};

export function visitStatsFromRows(rows: readonly VisitStatRow[]): VisitStats {
  const pick = (kind: string) =>
    rows.filter((r) => r.kind === kind).map((r) => ({ key: r.key, views: Number(r.views) || 0 }));
  const most = (a: { key: string; views: number }, b: { key: string; views: number }) =>
    b.views - a.views || a.key.localeCompare(b.key);
  const days = pick("day").sort((a, b) => b.key.localeCompare(a.key));
  return {
    total: days.reduce((sum, d) => sum + d.views, 0),
    days,
    sources: pick("source").sort(most),
    paths: pick("path").sort(most),
  };
}

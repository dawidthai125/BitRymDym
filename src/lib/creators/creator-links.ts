/**
 * Social links on a public creator profile. Pure. Input is untrusted: a full address or a handle
 * becomes one canonical https profile address on a known host, or an error code. Only profile
 * paths pass, so share, redirect and login pages of these sites cannot be used.
 */
export const CREATOR_SERVICES = ["youtube", "spotify", "instagram", "facebook", "tiktok", "soundcloud"] as const;
export type CreatorService = (typeof CREATOR_SERVICES)[number];
export type CreatorLinks = Partial<Record<CreatorService, string>>;

export const CREATOR_LINK_MAX = 200;

/** Names used by SocialIcon and shown to visitors. */
export const CREATOR_SERVICE_LABEL: Readonly<Record<CreatorService, string>> = {
  youtube: "YouTube",
  spotify: "Spotify",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  soundcloud: "SoundCloud",
};

/** too_long / bad_input: not an address or a handle; wrong_site: another host; not_profile: not a profile page. */
export type CreatorLinkError = "too_long" | "bad_input" | "wrong_site" | "not_profile";
export type CreatorLinkResult = { ok: true; value: string | null } | { ok: false; error: CreatorLinkError };

const fail = (error: CreatorLinkError): CreatorLinkResult => ({ ok: false, error });
const done = (value: string | null): CreatorLinkResult =>
  value !== null && value.length > CREATOR_LINK_MAX ? fail("too_long") : { ok: true, value };

type Rule = {
  /** Exact host names. Short and redirect hosts (youtu.be, l.facebook.com, vm.tiktok.com…) are not here. */
  hosts: readonly string[];
  /** Path segments (decoded) and query → canonical address. Null = not a profile. */
  fromPath: (segments: readonly string[], query: URLSearchParams, host: string) => string | null;
  fromHandle: (handle: string) => string | null;
};

const YT_TABS = new Set(["featured", "videos", "shorts", "streams", "playlists", "releases", "podcasts", "community", "posts", "about"]);
const YT_HANDLE = /^[\p{L}\p{N}][\p{L}\p{N}._·-]{1,59}$/u;
const YT_NAME = /^[A-Za-z0-9._-]{1,60}$/;

const SPOTIFY_ARTIST = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_USER = /^[A-Za-z0-9._-]{2,64}$/;

const IG_NAME = /^(?!.*\.\.)[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/;
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal", "web", "share", "l", "api", "oauth", "challenge", "emails"]);

const FB_NAME = /^[A-Za-z0-9][A-Za-z0-9.]{2,49}$/;
const FB_ID = /^\d{5,20}$/;
const FB_TITLE = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,79}$/u;
const FB_RESERVED = new Set([
  "sharer", "share", "dialog", "login", "recover", "reg", "signup", "groups", "events", "watch", "photo", "photos", "story", "stories",
  "plugins", "hashtag", "help", "policies", "policy", "marketplace", "messages", "gaming", "reel", "reels", "flx", "ads", "business",
  "permalink", "media", "posts", "videos", "people", "pages", "public", "search", "settings", "home", "oauth", "tr", "checkpoint", "notes",
]);

const TT_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,22}[A-Za-z0-9_])$/;

const SC_NAME = /^[a-z0-9](?:[a-z0-9_-]{1,38})$/;
const SC_TABS = new Set(["tracks", "popular-tracks", "albums", "sets", "reposts", "likes", "followers", "following", "spotlight"]);
const SC_RESERVED = new Set([
  "discover", "stream", "search", "you", "upload", "settings", "pages", "messages", "charts", "tags", "signin", "login", "logout",
  "connect", "oauth", "notifications", "people", "imprint", "terms-of-use", "mobile", "pro", "jobs", "popular", "feed", "library",
]);

function facebookName(name: string): string | null {
  const lower = name.toLowerCase();
  if (!FB_NAME.test(name) || lower.endsWith(".php") || FB_RESERVED.has(lower)) return null;
  return `https://www.facebook.com/${name}`;
}

function soundcloudName(raw: string): string | null {
  const name = raw.toLowerCase();
  return SC_NAME.test(name) && !SC_RESERVED.has(name) ? `https://soundcloud.com/${name}` : null;
}

function instagramName(name: string): string | null {
  return IG_NAME.test(name) && !IG_RESERVED.has(name.toLowerCase()) ? `https://www.instagram.com/${name}` : null;
}

const youtubeHandle = (handle: string) => (YT_HANDLE.test(handle) ? `https://www.youtube.com/@${encodeURIComponent(handle)}` : null);

const RULES: Readonly<Record<CreatorService, Rule>> = {
  youtube: {
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"],
    fromPath(seg, _query, host) {
      const [first = "", second, third] = seg;
      if (first.startsWith("@")) return seg.length <= 2 && (second === undefined || YT_TABS.has(second)) ? youtubeHandle(first.slice(1)) : null;
      if (seg.length < 2 || seg.length > 3 || (third !== undefined && !YT_TABS.has(third)) || !second) return null;
      if (first === "channel") {
        if (!/^UC[A-Za-z0-9_-]{22}$/.test(second)) return null;
        return `https://${host === "music.youtube.com" ? "music" : "www"}.youtube.com/channel/${second}`;
      }
      if ((first === "c" || first === "user") && YT_NAME.test(second)) return `https://www.youtube.com/${first}/${second}`;
      return null;
    },
    fromHandle: youtubeHandle,
  },
  spotify: {
    hosts: ["open.spotify.com"],
    fromPath(raw) {
      const seg = raw[0] && /^intl-[a-z]{2}$/.test(raw[0]) ? raw.slice(1) : raw;
      if (seg.length !== 2 || !seg[1]) return null;
      if (seg[0] === "artist" && SPOTIFY_ARTIST.test(seg[1])) return `https://open.spotify.com/artist/${seg[1]}`;
      if (seg[0] === "user" && SPOTIFY_USER.test(seg[1])) return `https://open.spotify.com/user/${seg[1]}`;
      return null;
    },
    fromHandle(handle) {
      // An artist id is always 22 characters and mixes letters with digits.
      if (SPOTIFY_ARTIST.test(handle) && /\d/.test(handle) && /[A-Z]/.test(handle)) return `https://open.spotify.com/artist/${handle}`;
      return SPOTIFY_USER.test(handle) ? `https://open.spotify.com/user/${handle}` : null;
    },
  },
  instagram: {
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
    fromPath: (seg) => (seg.length === 1 ? instagramName(seg[0]!) : null),
    fromHandle: instagramName,
  },
  facebook: {
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "pl-pl.facebook.com", "fb.com", "www.fb.com"],
    fromPath(seg, query) {
      const [first = "", second = "", third = ""] = seg;
      if (seg.length === 1 && first === "profile.php") {
        const id = query.get("id") ?? "";
        return FB_ID.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
      }
      if (seg.length === 1) return facebookName(first);
      if (seg.length === 2 && first === "p" && FB_TITLE.test(second) && /-\d{5,20}$/.test(second)) {
        return `https://www.facebook.com/p/${encodeURIComponent(second)}`;
      }
      if (seg.length === 3 && (first === "people" || first === "pages") && FB_TITLE.test(second) && FB_ID.test(third)) {
        return `https://www.facebook.com/${first}/${encodeURIComponent(second)}/${third}`;
      }
      return null;
    },
    fromHandle: facebookName,
  },
  tiktok: {
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
    fromPath: (seg) => (seg.length === 1 && seg[0]!.startsWith("@") && TT_NAME.test(seg[0]!.slice(1)) ? `https://www.tiktok.com/${seg[0]}` : null),
    fromHandle: (handle) => (TT_NAME.test(handle) ? `https://www.tiktok.com/@${handle}` : null),
  },
  soundcloud: {
    hosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"],
    fromPath: (seg) => (seg.length === 1 || (seg.length === 2 && SC_TABS.has(seg[1]!)) ? soundcloudName(seg[0]!) : null),
    fromHandle: soundcloudName,
  },
};

const ALL_HOSTS = new Set(CREATOR_SERVICES.flatMap((service) => RULES[service].hosts));

function decodeSegments(pathname: string): string[] | null {
  try {
    const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    // An encoded slash, dot segment or control character has no place in a profile address.
    return segments.some((s) => s === "." || s === ".." || /[/\\\p{C}]/u.test(s)) ? null : segments;
  } catch {
    return null;
  }
}

/** One field: "" → no link, otherwise the canonical https address or an error code. Idempotent. */
export function normalizeCreatorLink(service: CreatorService, raw: unknown): CreatorLinkResult {
  if (raw === undefined || raw === null) return done(null);
  if (typeof raw !== "string") return fail("bad_input");
  const text = raw.trim().normalize("NFC");
  if (!text) return done(null);
  if (text.length > CREATOR_LINK_MAX) return fail("too_long");
  // Spaces, control, invisible and direction marks, backslashes, HTML.
  if (/[\s\\<>"'`{}|^\p{C}\p{Z}]/u.test(text)) return fail("bad_input");
  const rule = RULES[service];

  let address: string | null = null;
  if (/^https?:\/\//i.test(text)) {
    address = text.replace(/^https?:\/\//i, "https://");
  } else {
    const head = text.split(/[/?#]/, 1)[0]!.toLowerCase();
    if (rule.hosts.includes(head)) address = `https://${text}`;
  }

  if (address) {
    // The part before the path must be a bare host: no user info, no port.
    if (!/^https:\/\/[a-z0-9.-]+(?:[/?#]|$)/i.test(address)) return fail("bad_input");
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return fail("bad_input");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return fail("bad_input");
    if (!rule.hosts.includes(url.hostname)) return fail("wrong_site");
    const segments = decodeSegments(url.pathname);
    const value = segments && segments.length > 0 ? rule.fromPath(segments, url.searchParams, url.hostname) : null;
    return value ? done(value) : fail("not_profile");
  }

  if (service === "spotify") {
    const uri = /^spotify:(artist|user):([A-Za-z0-9._-]{2,64})$/.exec(text);
    if (uri) {
      const value = rule.fromPath([uri[1]!, uri[2]!], new URLSearchParams(), "");
      return value ? done(value) : fail("not_profile");
    }
  }
  if (/[:/?#&=%]/.test(text)) return fail("bad_input");
  // "instagram.com" typed into another field: a site, not a handle.
  if (ALL_HOSTS.has(text.toLowerCase())) return fail("wrong_site");
  const value = rule.fromHandle(text.startsWith("@") ? text.slice(1) : text);
  return value ? done(value) : fail("bad_input");
}

export type ParsedCreatorLinks =
  | { ok: true; links: Record<CreatorService, string | null> }
  | { ok: false; errors: Partial<Record<CreatorService, CreatorLinkError>> };

/** All fields of the form at once; one error per field. */
export function parseCreatorLinks(input: unknown): ParsedCreatorLinks {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const links = {} as Record<CreatorService, string | null>;
  const errors: Partial<Record<CreatorService, CreatorLinkError>> = {};
  for (const service of CREATOR_SERVICES) {
    const result = normalizeCreatorLink(service, raw[service]);
    if (result.ok) links[service] = result.value;
    else errors[service] = result.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, links };
}

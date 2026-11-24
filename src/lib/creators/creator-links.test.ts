import { describe, expect, it } from "vitest";

import { CREATOR_SERVICES, normalizeCreatorLink, parseCreatorLinks, type CreatorService } from "./creator-links";

const ok = (service: CreatorService, raw: string) => {
  const result = normalizeCreatorLink(service, raw);
  return result.ok ? result.value : `error:${result.error}`;
};

describe("normalizeCreatorLink: what people paste", () => {
  it.each<[CreatorService, string, string]>([
    ["youtube", "https://www.youtube.com/@Zolty_MC?si=abc&utm_source=x", "https://www.youtube.com/@Zolty_MC"],
    ["youtube", "http://m.youtube.com/@zolty/videos#top", "https://www.youtube.com/@zolty"],
    ["youtube", "youtube.com/c/zolty", "https://www.youtube.com/c/zolty"],
    ["youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"],
    ["youtube", "https://music.youtube.com/channel/UCabcdefghijklmnopqrstuv?feature=share", "https://music.youtube.com/channel/UCabcdefghijklmnopqrstuv"],
    ["youtube", "@zolty", "https://www.youtube.com/@zolty"],
    ["spotify", "https://open.spotify.com/intl-pl/artist/4Z8W4fKeB5YxbusRsdQVPb?si=1", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
    ["spotify", "spotify:artist:4Z8W4fKeB5YxbusRsdQVPb", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
    ["spotify", "4Z8W4fKeB5YxbusRsdQVPb", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
    ["spotify", "zolty.mc", "https://open.spotify.com/user/zolty.mc"],
    ["instagram", "https://www.instagram.com/zolty.mc/?igsh=abc", "https://www.instagram.com/zolty.mc"],
    ["instagram", "instagram.com/zolty", "https://www.instagram.com/zolty"],
    ["instagram", "  @bitrymdym.pl ", "https://www.instagram.com/bitrymdym.pl"],
    ["facebook", "https://m.facebook.com/zolty.mc?mibextid=1", "https://www.facebook.com/zolty.mc"],
    ["facebook", "https://www.facebook.com/profile.php?id=100012345678901&sk=about", "https://www.facebook.com/profile.php?id=100012345678901"],
    ["facebook", "fb.com/zoltymc", "https://www.facebook.com/zoltymc"],
    ["facebook", "https://www.facebook.com/people/Zolty-MC/61550000000000/", "https://www.facebook.com/people/Zolty-MC/61550000000000"],
    ["tiktok", "https://www.tiktok.com/@zolty.mc?lang=pl", "https://www.tiktok.com/@zolty.mc"],
    ["tiktok", "zolty_mc", "https://www.tiktok.com/@zolty_mc"],
    ["soundcloud", "https://soundcloud.com/zolty-mc/tracks", "https://soundcloud.com/zolty-mc"],
    ["soundcloud", "ZoltyMC", "https://soundcloud.com/zoltymc"],
  ])("%s: %s", (service, raw, expected) => {
    expect(ok(service, raw)).toBe(expected);
    // Saving the stored value again changes nothing.
    expect(ok(service, expected)).toBe(expected);
  });

  it("an empty field means no link", () => {
    for (const raw of ["", "   ", null, undefined]) expect(normalizeCreatorLink("youtube", raw)).toEqual({ ok: true, value: null });
  });
});

describe("normalizeCreatorLink: hostile input", () => {
  const HOSTILE = [
    "javascript:alert(1)",
    "JaVaScRiPt://www.instagram.com/%0aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "//evil.example/zolty",
    "///evil.example",
    "https://evil.example/instagram.com/zolty",
    "https://instagram.com.evil.example/zolty",
    "https://evilinstagram.com/zolty",
    "https://www.instagram.com@evil.example/zolty",
    "https://user:pass@www.instagram.com/zolty",
    "https://www.instagram.com:8443/zolty",
    "https://www.instagram.com:443/zolty",
    "https://www.instagram.com./zolty",
    "https://www.instagram.com\\@evil.example/zolty",
    "https:\\\\evil.example",
    "https:/www.instagram.com/zolty",
    "https://www.instagram.com/zolty\nhttps://evil.example",
    "https://www.instagram.com/zolty\tx",
    "https://www.instagram.com/zolty %20",
    "https://www.instagram.com/zolty\"onmouseover=alert(1)",
    "https://www.instagram.com/<script>",
    "https://www.instagram.com/..%2f..%2fevil",
    "https://www.instagram.com/%00zolty",
    "https://www.instagram.com/zolty%0d%0aSet-Cookie:a",
    "https://www.instagram.com/%E2%80%AEzolty",
    "https://xn--nstagram-z2a.com/zolty",
    "https://1nstagram.com/zolty",
    "https://[::1]/zolty",
    "https://127.0.0.1/zolty",
    "ftp://www.instagram.com/zolty",
    "https://l.instagram.com/?u=https%3A%2F%2Fevil.example",
    "https://www.instagram.com/p/abc",
    "https://www.instagram.com/accounts/login/?next=https://evil.example",
    "https://www.instagram.com/",
    "https://www.instagram.com",
    "instagram.com",
    "youtube.com",
    "zol ty",
    "zolty?x=1",
    "..",
    "@",
  ];
  it.each(HOSTILE)("rejects %j", (raw) => {
    expect(normalizeCreatorLink("instagram", raw).ok).toBe(false);
  });

  it("invisible and right-to-left characters are refused", () => {
    for (const code of [0x200b, 0x202e, 0x2066, 0xfeff, 0xad, 0xa0, 0x2028]) {
      const raw = `https://www.instagram.com/zol${String.fromCodePoint(code)}ty`;
      expect(normalizeCreatorLink("instagram", raw)).toEqual({ ok: false, error: "bad_input" });
    }
  });

  it.each<[CreatorService, string]>([
    ["youtube", "https://www.youtube.com/redirect?q=https://evil.example"],
    ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["youtube", "https://youtu.be/dQw4w9WgXcQ"],
    ["youtube", "https://www.youtube.com/signin?next=/evil"],
    ["youtube", "https://www.youtube.com/@zolty/live/evil"],
    ["spotify", "https://spotify.link/abc"],
    ["spotify", "https://accounts.spotify.com/authorize?redirect_uri=https://evil.example"],
    ["spotify", "https://open.spotify.com/track/4Z8W4fKeB5YxbusRsdQVPb"],
    ["facebook", "https://l.facebook.com/l.php?u=https://evil.example"],
    ["facebook", "https://www.facebook.com/l.php?u=https://evil.example"],
    ["facebook", "https://www.facebook.com/flx/warn/?u=https://evil.example"],
    ["facebook", "https://www.facebook.com/sharer/sharer.php?u=https://evil.example"],
    ["facebook", "https://www.facebook.com/sharer.php"],
    ["facebook", "https://www.facebook.com/dialog/oauth?redirect_uri=https://evil.example"],
    ["facebook", "https://www.facebook.com/profile.php?id=1;evil"],
    ["facebook", "https://www.facebook.com/login"],
    ["tiktok", "https://vm.tiktok.com/ZM123/"],
    ["tiktok", "https://www.tiktok.com/link/v2?target=https://evil.example"],
    ["tiktok", "https://www.tiktok.com/@zolty/video/1"],
    ["soundcloud", "https://on.soundcloud.com/abc"],
    ["soundcloud", "https://soundcloud.com/connect?redirect_uri=https://evil.example"],
    ["soundcloud", "https://exit.sc/?url=https://evil.example"],
    ["soundcloud", "https://soundcloud.com/zolty/some-track"],
  ])("%s keeps redirect, share and non-profile pages out: %s", (service, raw) => {
    expect(normalizeCreatorLink(service, raw).ok).toBe(false);
  });

  it("caps the length and refuses other types", () => {
    expect(normalizeCreatorLink("instagram", `https://www.instagram.com/${"a".repeat(300)}`)).toEqual({ ok: false, error: "too_long" });
    for (const raw of [1, true, {}, [], () => "x"]) expect(normalizeCreatorLink("instagram", raw).ok).toBe(false);
  });

  it("another service's address is named as such", () => {
    expect(normalizeCreatorLink("youtube", "https://www.instagram.com/zolty")).toEqual({ ok: false, error: "wrong_site" });
  });
});

describe("parseCreatorLinks", () => {
  it("returns one error per wrong field and no links", () => {
    expect(parseCreatorLinks({ youtube: "@zolty", instagram: "javascript:alert(1)", tiktok: "https://evil.example/@x" })).toEqual({
      ok: false,
      errors: { instagram: "bad_input", tiktok: "wrong_site" },
    });
  });
  it("ignores unknown fields and fills the rest with null", () => {
    const parsed = parseCreatorLinks({ youtube: "@zolty", myspace: "x" });
    expect(parsed.ok && Object.keys(parsed.links).sort()).toEqual([...CREATOR_SERVICES].sort());
    expect(parsed.ok && parsed.links.youtube).toBe("https://www.youtube.com/@zolty");
    expect(parseCreatorLinks("x")).toMatchObject({ ok: true });
  });
});

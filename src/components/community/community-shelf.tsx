import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { id: "beats", href: "/beats?zrodlo=brd", label: "beats" },
  { id: "beatRank", href: "/ranking", label: "beatRank" },
  { id: "samples", href: "/sampel?zrodlo=user", label: "samples" },
  { id: "sampleRank", href: "/ranking/sampel", label: "sampleRank" },
  { id: "works", href: "/utwory", label: "works" },
  { id: "workRank", href: "/ranking/utwor", label: "workRank" },
] as const;

export type CommunityTab = (typeof TABS)[number]["id"];

export async function CommunityShelf({
  current,
  tone = "paper",
}: {
  current: CommunityTab | "none";
  tone?: "paper" | "tape";
}) {
  const t = await getTranslations("community.shelf");
  const tape = tone === "tape";
  return (
    <nav aria-label={t("aria")} className="mb-4">
      <ul className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center px-3 font-poster text-sm font-bold uppercase tracking-[0.12em] underline-offset-[6px] decoration-2",
                  tape ? "text-tape-cream" : "text-[var(--brd-ink-soft)]",
                  active && (tape
                    ? "text-tape-amber underline decoration-tape-amber"
                    : "text-[var(--brd-ink)] underline decoration-[var(--brd-green)]"),
                )}
              >
                {t(tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export async function CommunitySource({
  kind,
  source,
}: {
  kind: "beats" | "samples";
  source: "brd" | "user";
}) {
  const t = await getTranslations("community.source");
  const base = kind === "beats" ? "/beats" : "/sampel";
  const items = [
    { id: "brd" as const, href: `${base}?zrodlo=brd` },
    { id: "user" as const, href: `${base}?zrodlo=user` },
  ];
  return (
    <nav aria-label={t("aria")} className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.id === source;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border px-3 text-sm",
                  active
                    ? "border-[var(--brd-ink)] text-[var(--brd-ink)]"
                    : "border-[var(--brd-line)] text-[var(--brd-mute)]",
                )}
              >
                {t(item.id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

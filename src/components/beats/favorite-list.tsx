"use client";

import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthorName } from "@/components/creators/author-name";
import { toggleBeatFavoriteAction } from "@/lib/beats/favorite-actions";
import type { FavoriteBeatCard } from "@/lib/beats/favorites";

export function FavoriteList({ items }: { items: FavoriteBeatCard[] }) {
  const t = useTranslations("beats.libraryFavoritesPage");
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    const result = await toggleBeatFavoriteAction(id);
    setBusy(null);
    if ("error" in result) return;
    if (!result.favorited) setRows((current) => current.filter((row) => row.id !== id));
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("pusto")}</p>;
  }

  return (
    <ul className="mt-6 divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
      {rows.map((beat) => (
        <li key={beat.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
          <div className="relative min-w-0 hover:text-[var(--brd-green)]">
            <p className="truncate font-medium">
              <Link href={`/beat/${beat.id}`} className="after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-current">{beat.title}</Link>
            </p>
            <p className="truncate text-sm text-[var(--brd-mute)]">
              <AuthorName name={beat.producer} href={beat.authorHref} /> · {beat.bpm} BPM
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-sm text-[var(--brd-ink)] underline-offset-4 hover:underline disabled:opacity-60"
            disabled={busy === beat.id}
            onClick={() => void remove(beat.id)}
          >
            {t("usun")}
          </button>
        </li>
      ))}
    </ul>
  );
}

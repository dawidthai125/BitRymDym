"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { reviewBeatCoverAction } from "@/lib/beats/owner-edit-actions";

export type CoverReviewItem = {
  beatId: string;
  title: string;
  coverUpdatedAt: string | null;
  filterNote: string | null;
};

/** User beats 2026-10-30 — moderator queue for covers waiting for a decision. */
export function CoverReviewQueue({ items }: { items: CoverReviewItem[] }) {
  const t = useTranslations("admin.adminModerationPage");
  const tl = useLibText();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(beatId: string, decision: "approve" | "reject") {
    setError(null);
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt(t("powodOdrzuceniaOkladki"))?.trim() || null;
      if (!reason) return;
    }
    startTransition(async () => {
      const result = await reviewBeatCoverAction({ beatId, decision, reason });
      if (!result.success) {
        setError(result.error ?? t("akcjaNiePowiodla"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="queue-covers">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--brd-line)] pb-2">
        <h2 id="queue-covers" className="text-lg font-medium tracking-tight">
          {t("okladkiDoModeracji")}
        </h2>
        <span className="brd-data text-sm text-[var(--brd-mute)]">{items.length}</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">{tl(error)}</p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("brakOkladek")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.beatId} className="flex flex-col gap-2 rounded-lg border border-[var(--brd-line)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/beats/${item.beatId}/cover?s=thumb&v=${item.coverUpdatedAt ? Date.parse(item.coverUpdatedAt) || 0 : 0}`}
                alt={t("okladkaBitu", { v0: tl(item.title) })}
                className="aspect-square w-full rounded-md border border-[var(--brd-line)] object-cover"
                loading="lazy"
              />
              <Link href={`/admin/moderation/${item.beatId}`} className="truncate font-medium underline-offset-4 hover:underline">
                {tl(item.title)}
              </Link>
              <p className="text-xs text-[var(--brd-mute)]">{item.filterNote ? tl(item.filterNote) : t("filtrNieaktywny")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => decide(item.beatId, "approve")}>
                  {t("zatwierdzOkladke")}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide(item.beatId, "reject")}>
                  {t("odrzucOkladke")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
